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
  const [image, setImage] = useState(null);

  const handleImage = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const imageUrl = URL.createObjectURL(file);
    setImage(imageUrl);
  };

  const createDesign = () => {
    if (!toolOn) return;

    alert(
      `Yêu cầu thiết kế đã được ghi nhận!\n\n` +
      `Loại: ${designType}\n` +
      `Kích thước: ${width || "--"} × ${height || "--"} ${unit}\n` +
      `Phong cách: ${style}\n\n` +
      `Nội dung:\n${content || "Chưa nhập nội dung"}`
    );
  };

  return (
    <div className="app">

      {/* HEADER */}
      <header className="topbar">
        <div className="brand-area">
          <div className="brand-icon">AI</div>

          <div>
            <div className="brand">AI DESIGN PRINT</div>
            <div className="subtitle">
              Thiết kế Backdrop • Biển quảng cáo • In ấn
            </div>
          </div>
        </div>

        <div className="power-area">
          <span className={toolOn ? "power-status active" : "power-status"}>
            ● {toolOn ? "ĐANG HOẠT ĐỘNG" : "ĐANG TẮT"}
          </span>

          <button
            className={toolOn ? "power-button on" : "power-button off"}
            onClick={() => setToolOn(!toolOn)}
          >
            {toolOn ? "ON" : "OFF"}
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="workspace">

        <section className="hero">
          <div>
            <span className="badge">VERSION 1.0</span>

            <h1>
              Tạo thiết kế
              <span> bằng AI</span>
            </h1>

            <p>
              Nhập yêu cầu, kích thước và phong cách.
              <br />
              AI Design Print sẽ hỗ trợ xây dựng ý tưởng thiết kế.
            </p>
          </div>
        </section>

        <div className="layout">

          {/* LEFT */}
          <section className="panel">

            <div className="section-title">
              <span>01</span>
              <h2>Loại thiết kế</h2>
            </div>

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
                    designType === type
                      ? "type active"
                      : "type"
                  }
                  onClick={() => setDesignType(type)}
                  disabled={!toolOn}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="section-title">
              <span>02</span>
              <h2>Kích thước</h2>
            </div>

            <div className="size-row">

              <div className="input-group">
                <label>Chiều ngang</label>

                <input
                  type="number"
                  placeholder="3"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  disabled={!toolOn}
                />
              </div>

              <div className="input-group">
                <label>Chiều cao</label>

                <input
                  type="number"
                  placeholder="2.7"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  disabled={!toolOn}
                />
              </div>

              <div className="input-group unit">
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

            <div className="section-title">
              <span>03</span>
              <h2>Nội dung thiết kế</h2>
            </div>

            <textarea
              className="content-input"
              placeholder={
                "Ví dụ:\nKHAI GIẢNG NĂM HỌC 2026 - 2027\nTrường Mầm non Kids World\nNgày ... tháng ... năm ..."
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!toolOn}
            />

            <div className="section-title">
              <span>04</span>
              <h2>Phong cách</h2>
            </div>

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

            <div className="section-title">
              <span>05</span>
              <h2>Logo / hình ảnh</h2>
            </div>

            <label className="upload-box">
              <input
                type="file"
                accept="image/*"
                onChange={handleImage}
                disabled={!toolOn}
              />

              <div className="upload-icon">＋</div>

              <div>
                <strong>Tải ảnh hoặc logo</strong>
                <small>PNG, JPG, WEBP</small>
              </div>
            </label>

            {image && (
              <div className="uploaded-preview">
                <img src={image} alt="Logo tải lên" />
              </div>
            )}

            <button
              className="create-button"
              onClick={createDesign}
              disabled={!toolOn}
            >
              ✨ TẠO THIẾT KẾ AI
            </button>

          </section>

          {/* RIGHT */}
          <section className="preview-panel">

            <div className="preview-header">
              <div>
                <span className="preview-label">LIVE PREVIEW</span>
                <h2>Xem trước thiết kế</h2>
              </div>

              <span className="preview-size">
                {width || "--"} × {height || "--"} {unit}
              </span>
            </div>

            <div className="preview-box">

              {image ? (
                <img
                  className="preview-image"
                  src={image}
                  alt="Preview"
                />
              ) : (
                <div className="preview-placeholder">

                  <div className="preview-icon">
                    ✦
                  </div>

                  <h3>Chưa có thiết kế</h3>

                  <p>
                    Nhập thông tin bên trái
                    <br />
                    và bắt đầu tạo thiết kế bằng AI.
                  </p>

                </div>
              )}

            </div>

            <div className="preview-info">

              <div>
                <span>LOẠI</span>
                <strong>{designType}</strong>
              </div>

              <div>
                <span>PHONG CÁCH</span>
                <strong>{style}</strong>
              </div>

              <div>
                <span>KÍCH THƯỚC</span>
                <strong>
                  {width || "--"} × {height || "--"} {unit}
                </strong>
              </div>

            </div>

            <div className="export-area">

              <div className="export-title">
                <h3>Xuất thiết kế</h3>
                <span>VECTOR / PRINT</span>
              </div>

              <div className="export-buttons">

                <button disabled>PNG</button>
                <button disabled>JPG</button>
                <button disabled>PDF</button>
                <button disabled>SVG</button>
                <button className="cdr" disabled>
                  CDR
                </button>

              </div>

              <small>
                Xuất file sẽ được kích hoạt sau khi thiết kế AI
                được tạo.
              </small>

            </div>

          </section>

        </div>

      </main>

      <footer>
        AI DESIGN PRINT • Backdrop • Signage • Printing
      </footer>

    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
