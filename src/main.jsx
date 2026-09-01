import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

function App() {
  const [toolOn, setToolOn] = useState(true);
  const [designType, setDesignType] = useState("Backdrop");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState("m");
  const [content, setContent] = useState("");
  const [style, setStyle] = useState("Hiện đại");

  const createDesign = () => {
    alert(
      `Đã nhận yêu cầu thiết kế!\n\nLoại: ${designType}\nKích thước: ${width} × ${height} ${unit}\nPhong cách: ${style}\n\nNội dung:\n${content}`
    );
  };

  return (
    <div className="app">
      {/* HEADER */}
      <header className="topbar">
        <div>
          <div className="brand">AI DESIGN PRINT</div>
          <div className="subtitle">
            Thiết kế Backdrop • Biển quảng cáo • In ấn
          </div>
        </div>

        <div className="power-area">
          <span>{toolOn ? "ĐANG HOẠT ĐỘNG" : "ĐANG TẮT"}</span>

          <button
            className={`power-button ${toolOn ? "on" : "off"}`}
            onClick={() => setToolOn(!toolOn)}
          >
            {toolOn ? "ON" : "OFF"}
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="workspace">
        <section className="intro">
          <h1>Tạo thiết kế bằng AI</h1>
          <p>
            Nhập thông tin thiết kế, AI sẽ giúp bạn xây dựng ý tưởng phù hợp
            với nhu cầu quảng cáo và in ấn.
          </p>
        </section>

        <div className="layout">
          {/* LEFT PANEL */}
          <section className="panel">
            <h2>1. Loại thiết kế</h2>

            <div className="design-types">
              {[
                "Backdrop",
                "Biển quảng cáo",
                "Banner",
                "Poster",
                "Standee",
                "In ấn",
              ].map((type) => (
                <button
                  key={type}
                  className={
                    designType === type ? "type active" : "type"
                  }
                  onClick={() => setDesignType(type)}
                  disabled={!toolOn}
                >
                  {type}
                </button>
              ))}
            </div>

            <h2>2. Kích thước</h2>

            <div className="size-row">
              <div>
                <label>Chiều ngang</label>
                <input
                  type="number"
                  placeholder="Ví dụ: 3"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  disabled={!toolOn}
                />
              </div>

              <div>
                <label>Chiều cao</label>
                <input
                  type="number"
                  placeholder="Ví dụ: 2.7"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  disabled={!toolOn}
                />
              </div>

              <div>
                <label>Đơn vị</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  disabled={!toolOn}
                >
                  <option value="m">m</option>
                  <option value="cm">cm</option>
                  <option value="mm">mm</option>
                </select>
              </div>
            </div>

            <h2>3. Nội dung thiết kế</h2>

            <textarea
              className="content-input"
              placeholder="Ví dụ: Khai giảng năm học 2026 - 2027, Trường Mầm non Kids World..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!toolOn}
            />

            <h2>4. Phong cách thiết kế</h2>

            <select
              className="style-select"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              disabled={!toolOn}
            >
              <option>Hiện đại</option>
              <option>Sang trọng</option>
              <option>Tối giản</option>
              <option>Thiếu nhi</option>
              <option>Khai giảng</option>
              <option>Sự kiện</option>
              <option>Theo yêu cầu</option>
            </select>

            <button
              className="create-button"
              onClick={createDesign}
              disabled={!toolOn}
            >
              ✨ TẠO THIẾT KẾ AI
            </button>
          </section>

          {/* RIGHT PANEL */}
          <section className="preview-panel">
            <div className="preview-header">
              <h2>Xem trước thiết kế</h2>
              <span>PREVIEW</span>
            </div>

            <div className="preview-box">
              <div className="preview-placeholder">
                <div className="preview-icon">🎨</div>

                <h3>Chưa có thiết kế</h3>

                <p>
                  Nhập thông tin bên trái và bấm
                  <br />
                  <strong>“TẠO THIẾT KẾ AI”</strong>
                </p>
              </div>
            </div>

            <div className="export-area">
              <h3>Xuất file</h3>

              <div className="export-buttons">
                <button disabled>PNG</button>
                <button disabled>JPG</button>
                <button disabled>PDF</button>
                <button disabled>SVG</button>
                <button disabled>CDR</button>
              </div>

              <small>
                CDR sẽ được phát triển ở phiên bản xuất vector nâng cao.
              </small>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
