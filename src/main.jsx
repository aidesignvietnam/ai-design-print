import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

function App() {
  const [toolOn, setToolOn] = useState(true);
  const [designType, setDesignType] = useState("Backdrop");
  const [width, setWidth] = useState("300");
  const [height, setHeight] = useState("270");
  const [unit, setUnit] = useState("cm");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("Hiện đại");
  const [uploadedImage, setUploadedImage] = useState(null);

  const designTypes = [
    "Backdrop",
    "Biển quảng cáo",
    "Banner",
    "Poster",
    "Standee",
    "Tờ rơi",
  ];

  const styles = [
    "Hiện đại",
    "Sang trọng",
    "Tối giản",
    "Thiếu nhi",
    "Khai giảng",
    "Sự kiện",
  ];

  const handleUpload = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploadedImage(URL.createObjectURL(file));
  };

const [generated, setGenerated] = useState(false);
const [generatedImage, setGeneratedImage] = useState(null);
const [generating, setGenerating] = useState(false);
const [error, setError] = useState("");

const handleCreate = async () => {
  if (!toolOn || generating) return;

  setGenerating(true);
  setGenerated(false);
  setGeneratedImage(null);
  setError("");

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        designType,
        width,
        height,
        unit,
        prompt,
        style,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Không thể tạo thiết kế.");
    }

    setGeneratedImage(data.image);
    setGenerated(true);
  } catch (err) {
    console.error(err);
    setError(err.message || "Có lỗi xảy ra.");
  } finally {
    setGenerating(false);
  }
};

  return (
    <div className={`app ${toolOn ? "" : "tool-off"}`}>

      {/* TOP BAR */}
      <header className="topbar">

        <div className="logo-area">
          <div className="logo-mark">AI</div>

          <div>
            <div className="logo-title">AI DESIGN PRINT</div>
            <div className="logo-subtitle">
              PROFESSIONAL DESIGN STUDIO
            </div>
          </div>
        </div>

        <div className="top-actions">

          <div className="ai-status">
            <span className="status-dot"></span>
            AI SYSTEM ONLINE
          </div>

          <button
            className={`power-switch ${toolOn ? "active" : ""}`}
            onClick={() => setToolOn(!toolOn)}
          >
            <span></span>
            {toolOn ? "ON" : "OFF"}
          </button>

        </div>
      </header>

      {/* MAIN APPLICATION */}
      <div className="studio">

        {/* LEFT SIDEBAR */}
        <aside className="sidebar">

          <div className="sidebar-heading">
            <span>CREATE</span>
            <small>01</small>
          </div>

          <div className="tool-list">

            {designTypes.map((type, index) => (
              <button
                key={type}
                className={`tool-item ${
                  designType === type ? "selected" : ""
                }`}
                onClick={() => setDesignType(type)}
                disabled={!toolOn}
              >
                <span className="tool-number">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <span>{type}</span>
              </button>
            ))}

          </div>

          <div className="sidebar-divider"></div>

          <div className="sidebar-heading">
            <span>ASSETS</span>
            <small>02</small>
          </div>

          <label className="upload-button">
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={!toolOn}
            />

            <span className="upload-symbol">↑</span>

            <span>
              <strong>Upload Image</strong>
              <small>PNG / JPG / WEBP</small>
            </span>
          </label>

          {uploadedImage && (
            <div className="asset-preview">
              <img src={uploadedImage} alt="Uploaded asset" />
            </div>
          )}

          <div className="sidebar-bottom">
            <div className="version">AI DESIGN PRINT</div>
            <div className="version-number">VERSION 1.0 PRO</div>
          </div>

        </aside>

        {/* CENTER CANVAS */}
        <main className="canvas-area">

          <div className="canvas-toolbar">

            <div className="canvas-title">
              <span>CANVAS</span>
              <strong>{designType}</strong>
            </div>

            <div className="canvas-tools">

              <button title="Undo">↶</button>
              <button title="Redo">↷</button>

              <span className="toolbar-divider"></span>

              <button title="Zoom out">−</button>

              <span className="zoom-value">100%</span>

              <button title="Zoom in">+</button>

            </div>

          </div>

          <div className="canvas-workspace">

            <div className="canvas-ruler horizontal">
              <span>0</span>
              <span>50</span>
              <span>100</span>
              <span>150</span>
              <span>200</span>
              <span>250</span>
              <span>300</span>
            </div>

            <div className="canvas-ruler vertical">
              <span>0</span>
              <span>50</span>
              <span>100</span>
              <span>150</span>
              <span>200</span>
              <span>250</span>
            </div>

            <div className="design-canvas">

{generated ? (
  <div className="demo-design">

    <div className="demo-decoration demo-top">
      ✦ ✦ ✦
    </div>

    <div className="demo-content">

      <div className="demo-small">
        {designType.toUpperCase()}
      </div>

      <h1>THIẾT KẾ AI</h1>

      <h2>
        {prompt
          ? prompt.slice(0, 70)
          : "Ý TƯỞNG THIẾT KẾ SẴN SÀNG"}
      </h2>

      <div className="demo-line"></div>

      <div className="demo-size">
        {width} × {height} {unit}
      </div>

      <div className="demo-style">
        PHONG CÁCH: {style.toUpperCase()}
      </div>

    </div>

    <div className="demo-decoration demo-bottom">
      ✦ ✦ ✦
    </div>

  </div>
) : uploadedImage ? (
  <img
    src={uploadedImage}
    className="canvas-image"
    alt="Canvas"
  />
) : (
  <div className="empty-canvas">

    <div className="canvas-icon">
      ✦
    </div>

    <div className="canvas-empty-title">
      YOUR DESIGN
    </div>

    <div className="canvas-empty-text">
      AI generated artwork will appear here
    </div>

    <div className="canvas-size">
      {width || "300"} × {height || "270"} {unit}
    </div>

  </div>
)}

            </div>

          </div>

          <div className="canvas-bottom">

            <div>
              <span>DOCUMENT</span>
              <strong>
                {width || "--"} × {height || "--"} {unit}
              </strong>
            </div>

            <div>
              <span>TYPE</span>
              <strong>{designType}</strong>
            </div>

            <div>
              <span>STATUS</span>
              <strong className="ready">READY</strong>
            </div>

          </div>

        </main>

        {/* RIGHT PANEL */}
        <aside className="properties">

          <div className="properties-header">
            <div>
              <span>AI DESIGN</span>
              <h2>Properties</h2>
            </div>

            <div className="properties-icon">✦</div>
          </div>

          {/* SIZE */}
          <section className="property-section">

            <div className="property-heading">
              <span>01</span>
              <strong>Canvas Size</strong>
            </div>

            <div className="size-inputs">

              <label>
                <span>W</span>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  disabled={!toolOn}
                />
              </label>

              <span className="multiply">×</span>

              <label>
                <span>H</span>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  disabled={!toolOn}
                />
              </label>

              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                disabled={!toolOn}
              >
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
              </select>

            </div>

          </section>

          {/* PROMPT */}
          <section className="property-section">

            <div className="property-heading">
              <span>02</span>
              <strong>Design Brief</strong>
            </div>

            <textarea
              className="ai-prompt"
              placeholder={
                "Mô tả thiết kế bạn muốn tạo...\n\nVí dụ: Backdrop khai giảng trường mầm non, màu sắc vui tươi, có hình các em nhỏ..."
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={!toolOn}
            />

          </section>

          {/* STYLE */}
          <section className="property-section">

            <div className="property-heading">
              <span>03</span>
              <strong>Visual Style</strong>
            </div>

            <div className="style-grid">

              {styles.map((item) => (
                <button
                  key={item}
                  className={style === item ? "style active" : "style"}
                  onClick={() => setStyle(item)}
                  disabled={!toolOn}
                >
                  {item}
                </button>
              ))}

            </div>

          </section>

          {/* AI BUTTON */}
          <button
            className="generate-button"
            onClick={handleCreate}
            disabled={!toolOn}
          >
            <span className="generate-icon">✦</span>

            <span>
              <strong>GENERATE DESIGN</strong>
              <small>CREATE WITH AI</small>
            </span>

            <span className="arrow">→</span>
          </button>

          {/* EXPORT */}
          <section className="export-section">

            <div className="property-heading">
              <span>04</span>
              <strong>Export</strong>
            </div>

            <div className="export-grid">

              <button disabled>
                <strong>PNG</strong>
                <small>IMAGE</small>
              </button>

              <button disabled>
                <strong>JPG</strong>
                <small>IMAGE</small>
              </button>

              <button disabled>
                <strong>PDF</strong>
                <small>PRINT</small>
              </button>

              <button disabled>
                <strong>SVG</strong>
                <small>VECTOR</small>
              </button>

              <button className="cdr-button" disabled>
                <strong>CDR</strong>
                <small>COREL</small>
              </button>

            </div>

          </section>

        </aside>

      </div>

      {/* FOOTER */}
      <footer className="footer">

        <span>AI DESIGN PRINT</span>

        <span>
          BACKDROP • SIGNAGE • PRINTING
        </span>

        <span>
          SYSTEM READY
        </span>

      </footer>

    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
