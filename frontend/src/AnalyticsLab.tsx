import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
type Dimension = "region" | "topic" | "sentiment" | "channel";
type RecordItem = { id: number; created_at: string | null; post_text: string | null; region: string | null; topic: string | null; sentiment: string | null; channel: string | null };
type ExploreResponse = { total: number; records: RecordItem[] };
type Props = { region: string; channel: string; sentiment: string };
const names: Record<Dimension, string> = { region: "Province", topic: "Topic", sentiment: "Sentiment", channel: "Channel" };
const colors = ["#247d77", "#d98554", "#657cc5", "#b96d8f", "#8b9c56", "#9b72b4", "#4594ac", "#c49a46", "#ce6e65", "#5f9c88"];
const sentimentColors: Record<string, string> = { Negative: "#d66565", Neutral: "#e7ae55", Positive: "#3c9b83", Unknown: "#a1aab5" };
const num = (n: number) => n.toLocaleString("en-ZA");
const label = (r: RecordItem, d: Dimension) => r[d] || "Unknown";
const month = (date: string | null) => date?.slice(0, 7) || "";
const percent = (a: number, b: number) => b ? `${(a / b * 100).toFixed(1)}%` : "0%";

export default function AnalyticsLab({ region, channel, sentiment }: Props) {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rowDim, setRowDim] = useState<Dimension>("region");
  const [colDim, setColDim] = useState<Dimension>("sentiment");
  const [metric, setMetric] = useState<"count" | "rowPercent">("count");
  const [chartMode, setChartMode] = useState<"grouped" | "stacked">("grouped");
  const [showMatrix, setShowMatrix] = useState(false);
  const [focus, setFocus] = useState<{ row: string; col: string } | null>(null);
  const [topic, setTopic] = useState("");
  const [province, setProvince] = useState("");
  const [periodA, setPeriodA] = useState("");
  const [periodB, setPeriodB] = useState("");
  const [commentPage, setCommentPage] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (channel) params.set("channel", channel);
    if (sentiment) params.set("sentiment", sentiment);
    setLoading(true); setError(""); setFocus(null); setCommentPage(0);
    fetch(`${API_URL}/analytics/explore?${params}`, { signal: controller.signal })
      .then(async (res) => { if (!res.ok) throw new Error(`Exploration API returned ${res.status}. Update backend/main.py and restart FastAPI.`); return res.json() as Promise<ExploreResponse>; })
      .then((data) => { if (!controller.signal.aborted) { setRecords(data.records); setTotal(data.total); } })
      .catch((err: unknown) => { if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : "Unable to load exploration data"); setRecords([]); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [region, channel, sentiment]);
  const dimensions = useMemo(() => ({
    region: [...new Set(records.map(r => label(r, "region")))].sort(),
    topic: [...new Set(records.map(r => label(r, "topic")))].sort(),
    sentiment: [...new Set(records.map(r => label(r, "sentiment")))].sort((a, b) => ["Negative", "Neutral", "Positive", "Unknown"].indexOf(a) - ["Negative", "Neutral", "Positive", "Unknown"].indexOf(b)),
    channel: [...new Set(records.map(r => label(r, "channel")))].sort(),
  }), [records]);
  const rowValues = dimensions[rowDim], colValues = dimensions[colDim];
  const matrix = useMemo(() => rowValues.map(row => {
    const matching = records.filter(r => label(r, rowDim) === row);
    const cells = colValues.map(col => matching.filter(r => label(r, colDim) === col).length);
    return { row, count: matching.length, cells };
  }).sort((a, b) => b.count - a.count), [records, rowValues, colValues, rowDim, colDim]);
  const maxCell = Math.max(1, ...matrix.flatMap(r => r.cells));
  const months = useMemo(() => [...new Set(records.map(r => month(r.created_at)).filter(Boolean))].sort(), [records]);
  const selectedA = months.includes(periodA) ? periodA : months.at(-2) || months.at(-1) || "";
  const selectedB = months.includes(periodB) ? periodB : months.at(-1) || "";
  const topics = dimensions.topic;
  const monthlyTopics = useMemo(() => topics.map(name => {
    const a = records.filter(r => label(r, "topic") === name && month(r.created_at) === selectedA).length;
    const b = records.filter(r => label(r, "topic") === name && month(r.created_at) === selectedB).length;
    return { name, previous: a, current: b, delta: b - a, change: a ? ((b - a) / a * 100) : (b ? null : 0) };
  }).sort((a, b) => b.delta - a.delta), [records, topics, selectedA, selectedB]);
  const selectedTopic = topics.includes(topic) ? topic : topics[0] || "";
  const selectedProvince = dimensions.region.includes(province) ? province : "";
  const topicRecords = records.filter(r => label(r, "topic") === selectedTopic && (!selectedProvince || label(r, "region") === selectedProvince));
  const negative = topicRecords.filter(r => r.sentiment === "Negative").length;
  const topicChannels = [...new Set(topicRecords.map(r => label(r, "channel")))].map(name => ({ name, count: topicRecords.filter(r => label(r, "channel") === name).length })).sort((a, b) => b.count - a.count);
  const topicTrend = months.map(m => ({ month: m, count: topicRecords.filter(r => month(r.created_at) === m).length }));
  const evidence = (focus ? records.filter(r => label(r, rowDim) === focus.row && label(r, colDim) === focus.col) : topicRecords).filter(r => !!r.post_text?.trim());
  const evidencePageCount = Math.max(1, Math.ceil(evidence.length / 4));
  const safePage = Math.min(commentPage, evidencePageCount - 1);
  const evidencePage = evidence.slice(safePage * 4, safePage * 4 + 4);
  // Matrix is already sorted by descending feedback count; Recharts displays the first item at the top.
  const chartData = matrix.map(r => Object.fromEntries([["name", r.row], ...colValues.map((col, i) => [col, chartMode === "stacked" || metric === "rowPercent" ? r.count ? +(r.cells[i] / r.count * 100).toFixed(1) : 0 : r.cells[i]])])) as ({name: string} & Record<string, string | number>)[];
  const resetFocus = () => { setFocus(null); setCommentPage(0); };
  return <div className="lab">
    <section className="lab-hero"><div><span className="lab-eyebrow">INSIGHTIQ / ANALYTICAL INVESTIGATION</span><h2>Discover the patterns<br/><em>behind customer experience.</em></h2><p>Cross-analyse customer signals, compare periods and investigate the feedback behind the numbers.</p></div><div className="lab-hero-stats"><span>RECORDS ANALYSED</span><strong>{num(total)}</strong><small>Across all matching feedback · not a 500-record sample</small></div></section>
    {loading && <div className="notice">Loading full customer intelligence dataset...</div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    {!loading && !error && <>
      <section className="lab-section"><div className="lab-heading"><div><span className="lab-eyebrow">01 / CROSS-ANALYSIS</span><h2>Explore relationships across dimensions</h2><p>Change either dimension to discover how topics, provinces, channels and sentiments intersect. Click any cell to inspect its evidence.</p></div><span className="lab-count">{num(records.length)} records</span></div>
        <div className="lab-controls"><label>Analyse by<select value={rowDim} onChange={e => { const d = e.target.value as Dimension; setRowDim(d); if (d === colDim) setColDim(rowDim); resetFocus(); }}>{(Object.keys(names) as Dimension[]).map(d => <option key={d} value={d}>{names[d]}</option>)}</select></label><span className="lab-cross">×</span><label>Break down by<select value={colDim} onChange={e => { const d = e.target.value as Dimension; setColDim(d); if (d === rowDim) setRowDim(colDim); resetFocus(); }}>{(Object.keys(names) as Dimension[]).map(d => <option key={d} value={d}>{names[d]}</option>)}</select></label><label>Show<select value={metric} onChange={e => setMetric(e.target.value as "count" | "rowPercent")}><option value="count">Number of feedback</option><option value="rowPercent">% within each row</option></select></label></div>
         <div className="lab-chart lab-chart--primary">
           <div className="lab-chart-toolbar"><div><strong>{names[rowDim]} × {names[colDim]}</strong><p>Compare {names[colDim].toLowerCase()} across {names[rowDim].toLowerCase()} values. Select a bar to inspect customer comments.</p></div><div className="lab-chart-switch" role="group" aria-label="Chart presentation"><button type="button" className={chartMode === "grouped" ? "active" : ""} aria-pressed={chartMode === "grouped"} onClick={() => setChartMode("grouped")}>Grouped bars</button><button type="button" className={chartMode === "stacked" ? "active" : ""} aria-pressed={chartMode === "stacked"} onClick={() => setChartMode("stacked")}>100% stacked</button></div></div>
           <div className="lab-cross-chart"><ResponsiveContainer width="100%" height={Math.max(320, matrix.length * (chartMode === "grouped" ? Math.min(14 * colValues.length + 20, 90) : 44) + 90)}><BarChart data={chartData} layout="vertical" barCategoryGap={chartMode === "grouped" ? "20%" : "30%"} margin={{top:12,right:22,left:12,bottom:12}}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5edef"/><XAxis type="number" domain={chartMode === "stacked" || metric === "rowPercent" ? [0,100] : [0,"auto"]} tick={{fontSize:11}} tickFormatter={v => chartMode === "stacked" || metric === "rowPercent" ? `${v}%` : num(Number(v))}/><YAxis type="category" dataKey="name" width={132} tick={{fontSize:11}}/><Tooltip formatter={(value, name) => [chartMode === "stacked" || metric === "rowPercent" ? `${Number(value).toFixed(1)}%` : num(Number(value)), String(name)]}/><Legend wrapperStyle={{fontSize:11,paddingTop:12}}/>{colValues.map((c,i) => <Bar key={c} dataKey={c} stackId={chartMode === "stacked" ? "composition" : undefined} fill={colDim === "sentiment" ? sentimentColors[c] || colors[i % colors.length] : colors[i % colors.length]} maxBarSize={chartMode === "stacked" ? 32 : 16} radius={chartMode === "stacked" ? 0 : [0,3,3,0]} cursor="pointer" onClick={(data: unknown) => { const item = data as {name?:string; payload?:{name?:string}}; const row = item.payload?.name || item.name; if (row) { setFocus({row,col:c}); setCommentPage(0); document.getElementById("lab-evidence")?.scrollIntoView({behavior:"smooth",block:"start"}); } }}/>)}</BarChart></ResponsiveContainer></div>
           <p className="lab-note">{chartMode === "stacked" ? "Each bar represents 100% of its group; compare the relative composition." : metric === "rowPercent" ? "Bars show the percentage within each group." : "Bars show feedback counts. Use 100% stacked to compare proportions."}</p>
         </div>
         <div className="lab-table-disclosure"><button type="button" className="lab-table-toggle" aria-expanded={showMatrix} onClick={() => setShowMatrix(v => !v)}><span><strong>{showMatrix ? "Hide" : "View"} detailed cross-analysis table</strong><small>Full breakdown with clickable cells and source evidence</small></span><span aria-hidden="true">{showMatrix ? "−" : "+"}</span></button>
         {showMatrix && <div className="lab-matrix-scroll"><table className="lab-matrix"><thead><tr><th>{names[rowDim]}</th>{colValues.map(c => <th key={c}>{c}</th>)}<th>Total</th></tr></thead><tbody>{matrix.map(r => <tr key={r.row}><th>{r.row}</th>{r.cells.map((count, i) => <td key={colValues[i]}><button type="button" className={`lab-heat-cell ${focus?.row === r.row && focus.col === colValues[i] ? "lab-heat-cell--selected" : ""}`} style={{ backgroundColor: `rgba(34, 137, 127, ${.06 + .72 * count / maxCell})` }} onClick={() => { setFocus({row:r.row,col:colValues[i]}); setCommentPage(0); document.getElementById("lab-evidence")?.scrollIntoView({behavior:"smooth",block:"start"}); }} title={`Inspect ${r.row} × ${colValues[i]}`}><strong>{metric === "count" ? num(count) : percent(count, r.count)}</strong></button></td>)}<td className="lab-total">{num(r.count)}</td></tr>)}</tbody></table></div>}</div>
         {focus && <div className="lab-selection"><span>Investigating <b>{focus.row} × {focus.col}</b> · {num(records.filter(r => label(r,rowDim) === focus.row && label(r,colDim) === focus.col).length)} matching records</span><button onClick={resetFocus}>Clear selection ×</button></div>}
      </section>
      <section className="lab-two-columns"><div className="lab-section"><div className="lab-heading"><div><span className="lab-eyebrow">02 / EMERGING SIGNALS</span><h2>What's gaining momentum?</h2><p>Compare topic volumes between two months. Changes reflect observed feedback, not proven changes in underlying incident rates.</p></div></div><div className="lab-periods"><label>Baseline month<select value={selectedA} onChange={e => setPeriodA(e.target.value)}>{months.map(m => <option key={m}>{m}</option>)}</select></label><label>Comparison month<select value={selectedB} onChange={e => setPeriodB(e.target.value)}>{months.map(m => <option key={m}>{m}</option>)}</select></label></div><div className="lab-trends">{monthlyTopics.slice(0,8).map(t => <div className="lab-trend" key={t.name}><div><strong>{t.name}</strong><span>{t.previous} → {t.current} mentions</span></div><span className={`lab-delta ${t.delta > 0 ? "up" : t.delta < 0 ? "down" : "flat"}`}>{t.delta > 0 ? "↗" : t.delta < 0 ? "↘" : "→"} {t.delta > 0 ? "+" : ""}{t.delta} {t.change === null ? "(new)" : `(${t.change > 0 ? "+" : ""}${t.change.toFixed(0)}%)`}</span></div>)}</div>{selectedA === selectedB && <p className="lab-note">Choose different months to see meaningful change.</p>}</div>
      <div className="lab-section"><div className="lab-heading"><div><span className="lab-eyebrow">03 / GEOGRAPHIC FRICTION</span><h2>Where is friction concentrated?</h2><p>Negative-feedback share by province, with each province's total as the denominator.</p></div></div><div className="lab-friction">{dimensions.region.map(p => { const group = records.filter(r => label(r,"region") === p); const neg = group.filter(r => r.sentiment === "Negative").length; const rate = group.length ? neg / group.length * 100 : 0; return <button type="button" className="lab-friction-row" key={p} onClick={() => {setProvince(p); setTopic(""); resetFocus(); document.getElementById("lab-investigation")?.scrollIntoView({behavior:"smooth",block:"start"});}}><span>{p}</span><div className="lab-track"><i style={{width:`${rate}%`}}/></div><strong>{rate.toFixed(1)}%</strong><small>{neg}/{group.length}</small></button>; })}</div><p className="lab-note">Select a province to investigate it in the Root Cause Explorer.</p></div></section>
      <section className="lab-section" id="lab-investigation"><div className="lab-heading"><div><span className="lab-eyebrow">04 / INVESTIGATE</span><h2>Root Cause Explorer</h2><p>Explore related channels, sentiment and timing for a topic. These are investigation signals, not confirmed causal explanations.</p></div><span className="lab-count">{num(topicRecords.length)} matching records</span></div><div className="lab-controls"><label>Issue topic<select value={selectedTopic} onChange={e => {setTopic(e.target.value);resetFocus();}}>{topics.map(t => <option key={t}>{t}</option>)}</select></label><label>Province<select value={selectedProvince} onChange={e => {setProvince(e.target.value);resetFocus();}}><option value="">All provinces</option>{dimensions.region.map(p => <option key={p}>{p}</option>)}</select></label></div><div className="lab-investigation-stats"><div><span>Matching feedback</span><strong>{num(topicRecords.length)}</strong></div><div><span>Negative feedback</span><strong>{num(negative)}</strong></div><div><span>Negative share</span><strong>{percent(negative,topicRecords.length)}</strong></div><div><span>Top contact channel</span><strong>{topicChannels[0]?.name || "—"}</strong></div></div><div className="lab-investigation-charts"><div><div className="lab-mini-heading"><strong>Topic trend</strong><span>Monthly mentions</span></div><ResponsiveContainer width="100%" height={235}><LineChart data={topicTrend} margin={{top:12,right:15,bottom:10,left:-18}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:10}}/><Tooltip/><Line dataKey="count" stroke="#258b80" strokeWidth={3} dot={{r:2}} type="monotone"/></LineChart></ResponsiveContainer></div><div><div className="lab-mini-heading"><strong>Channels driving this topic</strong><span>Feedback volume</span></div><div className="lab-channel-list">{topicChannels.map((c,i) => <div key={c.name}><span>{c.name}<b>{num(c.count)}</b></span><div className="lab-track"><i style={{width:`${topicRecords.length ? c.count / topicRecords.length * 100 : 0}%`,background:colors[i % colors.length]}}/></div></div>)}</div></div></div></section>
      <section className="lab-section" id="lab-evidence"><div className="lab-heading"><div><span className="lab-eyebrow">05 / SOURCE EVIDENCE</span><h2>Read the customer signals</h2><p>{focus ? `Showing comments for ${focus.row} × ${focus.col}.` : `Showing comments for ${selectedTopic}${selectedProvince ? ` in ${selectedProvince}` : ""}.`} These are actual feedback records.</p></div>{focus && <button className="lab-clear" onClick={resetFocus}>Clear cross-analysis selection ×</button>}</div><div className="lab-evidence">{evidencePage.map(r => <article key={r.id}><div><strong>{r.topic || "Unknown topic"}</strong><span className={`lab-sentiment lab-sentiment--${(r.sentiment || "unknown").toLowerCase()}`}>{r.sentiment || "Unknown"}</span></div><p>“{r.post_text}”</p><footer>{r.region || "Unknown province"} · {r.channel || "Unknown channel"} <span>{r.created_at ? new Date(r.created_at).toLocaleDateString("en-ZA") : "Date unavailable"}</span></footer></article>)}{!evidencePage.length && <p className="lab-note">No written customer comments match this selection.</p>}</div><div className="lab-pagination"><span>{num(evidence.length)} comments · page {safePage+1} of {evidencePageCount}</span><div><button disabled={safePage === 0} onClick={() => setCommentPage(p => Math.max(0,p-1))}>← Previous</button><button disabled={safePage >= evidencePageCount-1} onClick={() => setCommentPage(p => p+1)}>Next →</button></div></div></section>
    </>}
  </div>;
}
