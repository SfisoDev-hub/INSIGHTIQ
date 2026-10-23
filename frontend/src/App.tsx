import { useEffect, useMemo, useState, type CSSProperties } from "react";



import {



  Bar,



  BarChart,



  CartesianGrid,



  Cell,



  Line,



  LineChart,



  Pie,



  PieChart,



  ResponsiveContainer,



  Tooltip,



  XAxis,



  YAxis,



} from "recharts";



import ReactMarkdown from "react-markdown";



import "./App.css";



import IssueManagement from "./IssueManagement";

import AnalyticsLab from "./AnalyticsLab";

import "./AnalyticsLab.css";



const API_URL = import.meta.env.VITE_API_URL || "http\://localhost:8000";



type Page = "Overview" | "Customer Feedback" | "Issues & Actions" | "Analytics";



type Issue = {



  topic: string;



  province: string;



  channel: string;



  volume: number;



  severity: string;

  severity_reason?: string;



};



type Feedback = {



  id: number;



  created_at: string;



  post_text: string;



  sentiment: string | null;



  topic: string | null;



  channel: string | null;



  region: string | null;



};



type Analytics = {



  kpis: {



    total_feedback: number;



    negative_feedback: number;



    negative_percentage: number;



    unique_topics: number;



    critical_issue_groups: number;



  };



  sentiment: Record<string, number>;



  topics: Record<string, number>;



  regions: Record<string, number>;



  channels: Record<string, number>;



  monthly_trend: { month: string; count: number }[];



  ranked_issues: Issue[];



};



type RagResponse = {



  question: string;



  answer: string;



  sources: string[];



};



const suggestedQuestions = [
  "What are the most common customer complaints?",
  "What are customers saying about network connectivity?",
  "What are the main billing issues?",
  "What problems are customers experiencing with fibre installation?",
  "What improvements should the business prioritise?",
];

const assistantSuggestionStyles = `
.ai-welcome { display: flex; flex-direction: column; gap: 13px; }
.ai-suggestions-title { font-size: 11px; font-weight: 800; letter-spacing: .11em; color: #117d73; margin-top: 5px; }
.ai-suggestions-caption { margin: -6px 0 0; font-size: 12px; line-height: 1.5; color: #6b8291; }
.ai-suggestions { display: flex; flex-direction: column; gap: 9px; }
.ai-suggestion { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; text-align: left; background: #fff; border: 1px solid #dbe8ea; border-radius: 11px; padding: 13px 12px; color: #183c50; font: inherit; font-size: 13px; line-height: 1.45; cursor: pointer; transition: border-color .15s, background .15s, transform .15s; }
.ai-suggestion:hover, .ai-suggestion:focus-visible { border-color: #16877b; background: #f0faf7; transform: translateY(-1px); }
.ai-suggestion span:last-child { flex-shrink: 0; color: #16877b; font-size: 18px; }
`;

const pages: Page[] = [



  "Overview",



  "Customer Feedback",



  "Issues & Actions",



  "Analytics",



];



const sentimentColors: Record<string, string> = {



  Negative: "#d66565",



  Neutral: "#e7ae55",



  Positive: "#3c9b83",



  Unknown: "#a1aab5",



};



// Stable category colours: filtering never changes a category's assigned colour

const issueColors: Record<string, string> = {

  "Technical Support": "#6657B8",

  "Customer Service": "#E68B47",

  "Coverage": "#258B92",

  "Network Performance": "#4D76C6",

  "Service Cancellation": "#CE657F",

  "Fibre Installation": "#32A37B",

  "Billing": "#B48A35",

  "Mobile Data": "#8B69B4",

  "Connectivity": "#D16C5A",

  "Service Activation": "#668C46",

};

const provinceColors: Record<string, string> = {

  "Eastern Cape": "#4387A4",

  "Free State": "#9B70B7",

  "Gauteng": "#DE8356",

  "KwaZulu-Natal": "#3E9C82",

  "Limpopo": "#C76B87",

  "Mpumalanga": "#6B83C8",

  "North West": "#C29B46",

  "Northern Cape": "#8A9C58",

  "Western Cape": "#4B91A0",

};

const stableColor = (name: string, colors: Record<string, string>) =>

  colors[name] ?? "#718596";



const formatNumber = (value: number) => value.toLocaleString("en-ZA");



function App() {



  const [page, setPage] = useState<Page>("Overview");



  const [analytics, setAnalytics] = useState<Analytics | null>(null);



  const [feedback, setFeedback] = useState<Feedback[]>([]);



  const [feedbackTotal, setFeedbackTotal] = useState(0);

  const [feedbackSearch, setFeedbackSearch] = useState("");

  const [activeTheme, setActiveTheme] = useState("");

  const [voicePage, setVoicePage] = useState(1);

  const [voiceSentiment, setVoiceSentiment] = useState("");



  const [region, setRegion] = useState("");



  const [channel, setChannel] = useState("");



  const [sentiment, setSentiment] = useState("");



  const [regions, setRegions] = useState<string[]>([]);



  const [channels, setChannels] = useState<string[]>([]);



  const [loading, setLoading] = useState(true);



  const [error, setError] = useState("");



  const [assistantOpen, setAssistantOpen] = useState(false);



  const [question, setQuestion] = useState("");



  const [ragResult, setRagResult] = useState<RagResponse | null>(null);



  const [ragLoading, setRagLoading] = useState(false);



  const [ragError, setRagError] = useState("");



  // Fetch unfiltered values for filter dropdowns



  useEffect(() => {



    async function loadFilterOptions() {



      try {



        const response = await fetch(`${API_URL}/analytics`);



        if (!response.ok) throw new Error("Unable to load filters");



        const data: Analytics = await response.json();



        setRegions(Object.keys(data.regions).sort());



        setChannels(Object.keys(data.channels).sort());



      } catch (err) {



        console.error("Filter loading error:", err);



      }



    }



    loadFilterOptions();



  }, []);



  // Fetch real analytics whenever filters change



  useEffect(() => {



    let cancelled = false;



    async function loadAnalytics() {



      setLoading(true);



      setError("");



      const params = new URLSearchParams();



      if (region) params.set("region", region);



      if (channel) params.set("channel", channel);



      if (sentiment) params.set("sentiment", sentiment);



      try {



        const response = await fetch(



          `${API_URL}/analytics?${params.toString()}`



        );



        if (!response.ok) {



          throw new Error(`Analytics API returned ${response.status}`);



        }



        const data: Analytics = await response.json();



        if (!cancelled) setAnalytics(data);



      } catch (err) {



        if (!cancelled) {



          setError(err instanceof Error ? err.message : "Failed to load analytics");



          setAnalytics(null);



        }



      } finally {



        if (!cancelled) setLoading(false);



      }



    }



    loadAnalytics();



    return () => {



      cancelled = true;



    };



  }, [region, channel, sentiment]);



  // Load customer records using the same filters



  useEffect(() => {



    let cancelled = false;



    async function loadFeedback() {



      const params = new URLSearchParams({ limit: "500" });



      if (region) params.set("region", region);



      if (channel) params.set("channel", channel);



      if (sentiment) params.set("sentiment", sentiment);



      try {



        const response = await fetch(



          `${API_URL}/feedback?${params.toString()}`



        );



        if (!response.ok) throw new Error("Failed to fetch feedback");



        const data: { total: number; records: Feedback[] } =



          await response.json();



        if (!cancelled) {



          setFeedback(data.records);



          setFeedbackTotal(data.total);



        }



      } catch (err) {



        console.error(err);



        if (!cancelled) {



          setFeedback([]);



          setFeedbackTotal(0);



        }



      }



    }



    loadFeedback();



    return () => {



      cancelled = true;



    };



  }, [region, channel, sentiment]);



  const sentimentData = useMemo(



    () =>



      Object.entries(analytics?.sentiment ?? {}).map(([name, value]) => ({



        name,



        value,



      })),



    [analytics]



  );



  const topicData = useMemo(



    () =>



      Object.entries(analytics?.topics ?? {})



        .map(([name, count]) => ({ name, count }))



        .sort((a, b) => b.count - a.count),



    [analytics]



  );



  const regionData = useMemo(



    () =>



      Object.entries(analytics?.regions ?? {})



        .map(([name, count]) => ({ name, count }))



        .sort((a, b) => b.count - a.count),



    [analytics]



  );



  const channelData = useMemo(



    () =>



      Object.entries(analytics?.channels ?? {})



        .map(([name, count]) => ({ name, count }))



        .sort((a, b) => b.count - a.count),



    [analytics]



  );



  // Theme volumes come from the full filtered analytics result

  // Comment browsing uses the first batch returned by /feedback

  const leadingTheme = topicData[0];

  const positiveShare = analytics?.kpis.total_feedback

    ? Math.round(((analytics.sentiment.Positive ?? 0) / analytics.kpis.total_feedback) * 100)

    : 0;

  const negativeShare = analytics?.kpis.negative_percentage ?? 0;

  const visibleThemes = topicData.slice(0, 6);

  const voiceRecords = useMemo(() => {

    const term = feedbackSearch.trim().toLowerCase();

    return feedback.filter((item) =>

      (!activeTheme || item.topic === activeTheme) &&

      (!voiceSentiment || item.sentiment === voiceSentiment) &&

      (!term || [item.post_text, item.topic, item.region, item.channel]

        .some((value) => (value ?? "").toLowerCase().includes(term)))

    );

  }, [feedback, feedbackSearch, activeTheme, voiceSentiment]);

  const voicePageSize = 6;

  const voicePageCount = Math.max(1, Math.ceil(voiceRecords.length / voicePageSize));

  const voicePageSafe = Math.min(voicePage, voicePageCount);

  const pagedVoices = voiceRecords.slice((voicePageSafe - 1) * voicePageSize, voicePageSafe * voicePageSize);

  const selectTheme = (theme: string) => {

    setActiveTheme((current) => current === theme ? "" : theme);

    setVoicePage(1);

  };



  const askQuestion = async () => {



    if (!question.trim() || ragLoading) return;



    setRagLoading(true);



    setRagError("");



    setRagResult(null);



    try {



      const response = await fetch(`${API_URL}/ask`, {



        method: "POST",



        headers: { "Content-Type": "application/json" },



        body: JSON.stringify({ question: question.trim() }),



      });



      if (!response.ok) {



        throw new Error(`RAG API returned ${response.status}`);



      }



      const data: RagResponse = await response.json();



      setRagResult(data);



    } catch (err) {



      setRagError(



        err instanceof Error ? err.message : "Unable to generate answer"



      );



    } finally {



      setRagLoading(false);



    }



  };



  const clearFilters = () => {



    setRegion("");



    setChannel("");



    setSentiment("");



  };



  return (



    <div className="platform">
      <style>{assistantSuggestionStyles}</style>



      <aside className="sidebar">



        <div className="brand">



          <div className="brand-mark">



            <img src="/RAG_LOGO.png" alt="InsightsIQ Logo" />



          </div>



          <div>



            <strong>InsightsIQ</strong>



            <small>Customer Intelligence Platform</small>



          </div>



        </div>



        <div className="nav-caption">WORKSPACE</div>



        <nav className="navigation">



          {pages.map((item) => (



            <button



              key={item}



              className={`nav-link ${page === item ? "selected" : ""}`}



              onClick={() => setPage(item)}



            >



              <span className="nav-indicator" />



              {item}



            </button>



          ))}



        </nav>



        <div className="sidebar-footer">



          <span className="connection-dot" />



          Development environment



        </div>



      </aside>



      <div className="app-main">



        <header className="topbar">



          <div className="breadcrumbs">Workspace / {page}</div>



          <div className="header-actions">



            <span className="data-indicator">LIVE API DATA</span>



            <button



              className="ai-toggle"



              onClick={() => setAssistantOpen((open) => !open)}



            >



              {assistantOpen ? "Close AI" : "Ask Intelligence AI"}



            </button>



            <div className="avatar">EN</div>



          </div>



        </header>



        <div className="body-layout">



          <main className="page-content">



            <div className="page-title">



              <div>



                <span className="eyebrow">CUSTOMER EXPERIENCE INTELLIGENCE</span>



                <h1>{page}</h1>



                <p>



                  Explore telecom customer feedback, emerging issues and



                  geographic patterns.



                </p>



              </div>



            </div>



            <section className="filter-panel">



              <div className="filter-group">



                <label htmlFor="region">Province</label>



                <select



                  id="region"



                  value={region}



                  onChange={(event) => setRegion(event.target.value)}



                >



                  <option value="">All provinces</option>



                  {regions.map((item) => (



                    <option key={item} value={item}>



                      {item}



                    </option>



                  ))}



                </select>



              </div>



              <div className="filter-group">



                <label htmlFor="channel">Channel</label>



                <select



                  id="channel"



                  value={channel}



                  onChange={(event) => setChannel(event.target.value)}



                >



                  <option value="">All channels</option>



                  {channels.map((item) => (



                    <option key={item} value={item}>



                      {item}



                    </option>



                  ))}



                </select>



              </div>



              <div className="filter-group">



                <label htmlFor="sentiment">Sentiment</label>



                <select



                  id="sentiment"



                  value={sentiment}



                  onChange={(event) => setSentiment(event.target.value)}



                >



                  <option value="">All sentiments</option>



                  <option value="Negative">Negative</option>



                  <option value="Neutral">Neutral</option>



                  <option value="Positive">Positive</option>



                </select>



              </div>



              <button className="clear-button" onClick={clearFilters}>



                Reset filters



              </button>



            </section>



            {loading && <div className="notice">Loading live analytics...</div>}



            {error && <div className="notice error">{error}</div>}



            {analytics && !loading && (



              <>



                {page === "Overview" && <section className="kpi-grid">



                  <div className="kpi">



                    <span>Total Feedback</span>



                    <strong>{formatNumber(analytics.kpis.total_feedback)}</strong>



                    <small>Matching selected filters</small>



                  </div>



                  <div className="kpi">



                    <span>Negative Feedback</span>



                    <strong>{formatNumber(analytics.kpis.negative_feedback)}</strong>



                    <small>{analytics.kpis.negative_percentage}% of feedback</small>



                  </div>



                  <div className="kpi">



                    <span>Issue Categories</span>



                    <strong>{analytics.kpis.unique_topics}</strong>



                    <small>Distinct feedback topics</small>



                  </div>



                  <div className="kpi">



                    <span>Critical Issue Groups</span>



                    <strong>{analytics.kpis.critical_issue_groups}</strong>



                    <small>Suggested impact-based severity</small>



                  </div>



                </section>}



                {page === "Overview" && (



                  <>



                    <div className="chart-grid">



                      <section className="panel">



                        <div className="panel-heading">



                          <h2>Customer Sentiment</h2>



                          <p>Sentiment distribution across selected feedback</p>



                        </div>



                        <div className="chart-area">



                          <ResponsiveContainer width="100%" height="100%">



                            <PieChart>



                              <Pie



                                data={sentimentData}



                                dataKey="value"



                                nameKey="name"



                                innerRadius={65}



                                outerRadius={105}



                                paddingAngle={2}



                              >



                                {sentimentData.map((entry) => (



                                  <Cell



                                    key={entry.name}



                                    fill={sentimentColors[entry.name] || "#a1aab5"}



                                  />



                                ))}



                              </Pie>



                              <Tooltip formatter={(value) => formatNumber(Number(value))} />



                            </PieChart>



                          </ResponsiveContainer>



                        </div>



                        <div className="sentiment-legend">



                          {sentimentData.map((item) => (



                            <div key={item.name}>



                              <span



                                className="legend-dot"



                                style={{



                                  background:



                                    sentimentColors[item.name] || "#a1aab5",



                                }}



                              />



                              {item.name}



                              <strong>{formatNumber(item.value)}</strong>



                            </div>



                          ))}



                        </div>



                      </section>



                      <section className="panel">



                        <div className="panel-heading">



                          <h2>Top Customer Issues</h2>



                          <p>Feedback volume by issue category</p>



                        </div>



                        <div className="chart-area tall">



                          <ResponsiveContainer width="100%" height="100%">



                            <BarChart



                              data={topicData}



                              layout="vertical"



                              margin={{ top: 5, right: 15, left: 25, bottom: 5 }}



                            >



                              <CartesianGrid strokeDasharray="3 3" horizontal={false} />



                              <XAxis type="number" />



                              <YAxis



                                type="category"



                                dataKey="name"



                                width={120}



                                tick={{ fontSize: 11 }}



                              />



                              <Tooltip />



                              <Bar dataKey="count" name="Feedback" radius={[0, 5, 5, 0]}>

                                {topicData.map((item) => (

                                  <Cell key={item.name} fill={stableColor(item.name, issueColors)} />

                                ))}

                              </Bar>



                            </BarChart>



                          </ResponsiveContainer>



                        </div>

                        <div className="category-legend" aria-label="Top Customer Issues colour legend">

                            {topicData.map((item) => (

                              <div className="category-legend__item" key={item.name}>

                                <span className="category-legend__swatch" style={{ backgroundColor: stableColor(item.name, issueColors) }} />

                                <span className="category-legend__name">{item.name}</span>

                                <strong>{formatNumber(item.count)}</strong>

                              </div>

                            ))}

                          </div>





                      </section>



                      <section className="panel">



                        <div className="panel-heading">



                          <h2>Feedback Over Time</h2>



                          <p>Monthly customer feedback volume</p>



                        </div>



                        <div className="chart-area">



                          <ResponsiveContainer width="100%" height="100%">



                            <LineChart data={analytics.monthly_trend}>



                              <CartesianGrid strokeDasharray="3 3" />



                              <XAxis dataKey="month" tick={{ fontSize: 10 }} />



                              <YAxis tick={{ fontSize: 11 }} />



                              <Tooltip />



                              <Line



                                type="monotone"



                                dataKey="count"



                                stroke="#328e81"



                                strokeWidth={3}



                                dot={false}



                              />



                            </LineChart>



                          </ResponsiveContainer>



                        </div>



                      </section>



                      <section className="panel">



                        <div className="panel-heading">



                          <h2>Feedback by Province</h2>



                          <p>Geographic distribution</p>



                        </div>



                        <div className="chart-area tall">



                          <ResponsiveContainer width="100%" height="100%">



                            <BarChart



                              data={regionData}



                              layout="vertical"



                              margin={{ top: 5, right: 15, left: 25, bottom: 5 }}



                            >



                              <CartesianGrid strokeDasharray="3 3" horizontal={false} />



                              <XAxis type="number" />



                              <YAxis



                                type="category"



                                dataKey="name"



                                width={115}



                                tick={{ fontSize: 10 }}



                              />



                              <Tooltip />



                              <Bar dataKey="count" name="Feedback" radius={[0, 5, 5, 0]}>

                                {regionData.map((item) => (

                                  <Cell key={item.name} fill={stableColor(item.name, provinceColors)} />

                                ))}

                              </Bar>



                            </BarChart>



                          </ResponsiveContainer>



                        </div>

                        <div className="category-legend" aria-label="Feedback by Province colour legend">

                            {regionData.map((item) => (

                              <div className="category-legend__item" key={item.name}>

                                <span className="category-legend__swatch" style={{ backgroundColor: stableColor(item.name, provinceColors) }} />

                                <span className="category-legend__name">{item.name}</span>

                                <strong>{formatNumber(item.count)}</strong>

                              </div>

                            ))}

                          </div>





                      </section>



                    </div>



                    <section className="panel channel-panel">



                      <div className="panel-heading">



                        <h2>Feedback Channels</h2>



                        <p>Volume by customer contact channel</p>



                      </div>



                      <div className="channel-grid">



                        {channelData.map((item) => (



                          <div key={item.name} className="channel-item">



                            <span>{item.name}</span>



                            <strong>{formatNumber(item.count)}</strong>



                            <div className="progress-track">



                              <div



                                className="progress-fill"



                                style={{



                                  width: `${



                                    analytics.kpis.total_feedback



                                      ? (item.count /



                                          analytics.kpis.total_feedback) *



                                        100



                                      : 0



                                  }%`,



                                }}



                              />



                            </div>



                          </div>



                        ))}



                      </div>



                    </section>



                  </>



                )}



{page === "Overview" && (

                  <section className="panel insight-hotspots">

                    <div className="insight-hotspots__header">

                      <div className="panel-heading">

                        <h2>Customer Issue Hotspots</h2>

                        <p>Top complaint clusters by issue, province and contact channel</p>

                      </div>

                      <span className="insight-hotspots__pill">TOP 5</span>

                    </div>

                    {analytics.ranked_issues.length > 0 ? (

                      <div className="insight-hotspots__grid">

                        {analytics.ranked_issues.slice(0, 5).map((issue, index) => (

                          <article

                            key={`${issue.topic}-${issue.province}-${issue.channel}-${index}`}

                            className={`insight-hotspots__card ${index === 0 ? "insight-hotspots__card--featured" : ""}`}

                          >

                            <div className="insight-hotspots__card-head">

                              <span className="insight-hotspots__rank">{index === 0 ? "01 / LEADING HOTSPOT" : `0${index + 1} / HOTSPOT`}</span>

                              <span className="insight-hotspots__glyph" aria-hidden="true">{index === 0 ? "✦" : "↗"}</span>

                            </div>

                            <div className="insight-hotspots__card-main">

                              <div className="insight-hotspots__description">

                                <h3>{issue.topic}</h3>

                                <div className="insight-hotspots__meta">

                                  <span>{issue.province}</span>

                                  <span className="insight-hotspots__separator" aria-hidden="true" />

                                  <span>{issue.channel}</span>

                                </div>

                              </div>

                              <div className="insight-hotspots__volume">

                                <strong>{formatNumber(issue.volume)}</strong>

                                <span>complaints</span>

                              </div>

                            </div>

                          </article>

                        ))}

                      </div>

                    ) : (

                      <p className="insight-hotspots__empty">No ranked issues match the selected filters.</p>

                    )}

                    <div className="insight-hotspots__footer">

                      <span>Ranked by negative feedback volume</span>

                      <button type="button" onClick={() => setPage("Issues & Actions")}>Explore all issues <span aria-hidden="true">→</span></button>

                    </div>

                  </section>

                )}

              </>

            )}



            {page === "Analytics" && <AnalyticsLab region={region} channel={channel} sentiment={sentiment} />}



            {page === "Issues & Actions" && (



              <IssueManagement issues={analytics?.ranked_issues ?? []} />



            )}



            {page === "Customer Feedback" && analytics && !loading && (

              <div className="voice-workspace">

                <section className="voice-hero">

                  <div className="voice-hero__copy">

                    <span className="voice-kicker">VOICE OF THE CUSTOMER / LIVE SNAPSHOT</span>

                    <h2>Go beyond the numbers.<br /><em>Hear what matters.</em></h2>

                    <p>Explore the conversations shaping customer experience. This snapshot is calculated from your selected feedback—not an AI-generated conclusion.</p>

                    <div className="voice-hero__chips">

                      <span><i className="voice-chip-dot voice-chip-dot--negative" />{negativeShare}% negative</span>

                      <span><i className="voice-chip-dot voice-chip-dot--positive" />{positiveShare}% positive</span>

                      <span>{formatNumber(analytics.kpis.total_feedback)} matching feedback</span>

                    </div>

                  </div>

                  <div className="voice-hero__spotlight">

                    <span className="voice-hero__spotlight-label">MOST DISCUSSED THEME</span>

                    <strong>{leadingTheme?.name ?? "No theme yet"}</strong>

                    <div className="voice-hero__spotlight-bottom">

                      <span>{leadingTheme ? `${formatNumber(leadingTheme.count)} mentions` : "No feedback"}</span>

                      <span aria-hidden="true">✳</span>

                    </div>

                  </div>

                </section>



                <section className="voice-themes">

                  <div className="voice-section-heading">

                    <div><span className="voice-overline">01 / DISCOVER</span><h2>What customers are talking about</h2><p>Select a theme to explore matching customer voices below.</p></div>

                    {activeTheme && <button type="button" className="voice-text-button" onClick={() => selectTheme(activeTheme)}>Clear theme ×</button>}

                  </div>

                  <div className="voice-theme-grid">

                    {visibleThemes.map((item, index) => (

                      <button type="button" key={item.name} className={`voice-theme-card ${activeTheme === item.name ? "voice-theme-card--active" : ""}`} onClick={() => selectTheme(item.name)} style={{ "--theme-accent": stableColor(item.name, issueColors) } as CSSProperties} aria-pressed={activeTheme === item.name}>

                        <div className="voice-theme-card__top"><span className="voice-theme-card__index">{String(index + 1).padStart(2, "0")}</span><span className="voice-theme-card__arrow" aria-hidden="true">↗</span></div>

                        <strong>{item.name}</strong>

                        <div className="voice-theme-card__bottom"><span>{formatNumber(item.count)} mentions</span><span>{analytics.kpis.total_feedback ? Math.round(item.count / analytics.kpis.total_feedback * 100) : 0}% of feedback</span></div>

                      </button>

                    ))}

                  </div>

                  {visibleThemes.length === 0 && <p className="voice-empty">No themes match the selected filters.</p>}

                </section>



                <section className="voice-explorer">

                  <div className="voice-section-heading">

                    <div><span className="voice-overline">02 / LISTEN</span><h2>Explore customer voices</h2><p>Real comments, presented in a focused, readable format.</p></div>

                    <span className="voice-explorer__count">{formatNumber(voiceRecords.length)} loaded matches</span>

                  </div>

                  <div className="voice-controls">

                    <label className="voice-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search customer comments" placeholder="Search comments, topics or locations..." value={feedbackSearch} onChange={(event) => {setFeedbackSearch(event.target.value);setVoicePage(1);}} /></label>

                    <select aria-label="Filter customer voices by sentiment" value={voiceSentiment} onChange={(event) => {setVoiceSentiment(event.target.value);setVoicePage(1);}}><option value="">All sentiments</option><option value="Negative">Negative</option><option value="Neutral">Neutral</option><option value="Positive">Positive</option></select>

                    {(activeTheme || feedbackSearch || voiceSentiment) && <button type="button" className="voice-reset" onClick={() => {setActiveTheme("");setFeedbackSearch("");setVoiceSentiment("");setVoicePage(1);}}>Clear selection</button>}

                  </div>

                  {activeTheme && <div className="voice-active-filter">Exploring <strong>{activeTheme}</strong><button type="button" onClick={() => selectTheme(activeTheme)} aria-label="Remove theme filter">×</button></div>}

                  <div className="voice-comments">

                    {pagedVoices.map((item) => (

                      <article className="voice-comment" key={item.id}>

                        <div className="voice-comment__meta"><span className="voice-comment__topic" style={{ "--theme-accent": stableColor(item.topic ?? "", issueColors) } as CSSProperties}>{item.topic || "Uncategorised"}</span><span className={`voice-sentiment voice-sentiment--${(item.sentiment || "unknown").toLowerCase()}`}>{item.sentiment || "Unknown"}</span></div>

                        <p>“{item.post_text}”</p>

                        <div className="voice-comment__footer"><span>{item.region || "Unknown province"} <b>·</b> {item.channel || "Unknown channel"}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</time></div>

                      </article>

                    ))}

                    {pagedVoices.length === 0 && <div className="voice-empty">No loaded comments match your search. Try clearing a filter.</div>}

                  </div>

                  <div className="voice-pagination"><span>Showing {voiceRecords.length ? (voicePageSafe - 1) * voicePageSize + 1 : 0}–{Math.min(voicePageSafe * voicePageSize, voiceRecords.length)} of {formatNumber(voiceRecords.length)} loaded comments</span><div><button type="button" disabled={voicePageSafe <= 1} onClick={() => setVoicePage((p) => Math.max(1, p - 1))}>← Previous</button><span>Page {voicePageSafe} / {voicePageCount}</span><button type="button" disabled={voicePageSafe >= voicePageCount} onClick={() => setVoicePage((p) => Math.min(voicePageCount, p + 1))}>Next →</button></div></div>

                  {feedbackTotal > feedback.length && <p className="voice-limit-note">Browsing and text search cover the first {formatNumber(feedback.length)} records returned by the API, out of {formatNumber(feedbackTotal)} matching records. Theme counts above use the full analytics totals.</p>}

                </section>

              </div>

            )}



          </main>



          {assistantOpen && (



            <aside className="ai-sidebar">



              <div className="ai-header">



                <div>



                  <strong>Intelligence Assistant</strong>



                  <small>Semantic search + generative AI</small>



                </div>



                <button



                  className="close-ai"



                  onClick={() => setAssistantOpen(false)}



                  aria-label="Close assistant"



                >



                  ×



                </button>



              </div>



              <div className="ai-results">



                {!ragResult && !ragLoading && (
                  <div className="ai-welcome">
                    <div className="ai-hint">
                      Explore customer complaints, connectivity, billing and support experiences.
                    </div>
                    <div className="ai-suggestions-title">SUGGESTED QUESTIONS</div>
                    <p className="ai-suggestions-caption">Choose a question to fill the message box, or type your own.</p>
                    <div className="ai-suggestions">
                      {suggestedQuestions.map((suggestion) => (
                        <button
                          type="button"
                          key={suggestion}
                          className="ai-suggestion"
                          onClick={() => {
                            setQuestion(suggestion);
                            setRagError("");
                          }}
                        >
                          <span>{suggestion}</span>
                          <span aria-hidden="true">↗</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {ragResult && (



                  <>



                    <div className="ai-answer">



                      <h3>AI Analysis</h3>



                      <div className="markdown-content">



                        <ReactMarkdown>{ragResult.answer}</ReactMarkdown>



                      </div>



                    </div>



                    {ragResult.sources.length > 0 && (
                      <details className="ai-evidence-details" style={{ marginTop: 16 }}>
                        <summary style={{ cursor: "pointer", fontWeight: 600, color: "#176f68", padding: "10px 0" }}>
                          View supporting feedback ({ragResult.sources.length})
                        </summary>
                        <div style={{ paddingTop: 8 }}>
                          {ragResult.sources.map((source, index) => (
                            <div className="source-card" key={index}>
                              <small>Source {index + 1}</small>
                              <p>{source}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}



                  </>



                )}



                {ragError && <div className="notice error">{ragError}</div>}



              </div>



              <div className="ai-compose">



                <textarea



                  value={question}



                  onChange={(event) => setQuestion(event.target.value)}



                  placeholder="Ask a question about customer feedback..."



                  rows={3}



                />



                <button



                  onClick={askQuestion}



                  disabled={ragLoading || !question.trim()}



                >



                  {ragLoading ? "Analysing..." : "Generate Insight"}



                </button>



              </div>



            </aside>



          )}



        </div>



      </div>



    </div>



  );



}



export default App;
