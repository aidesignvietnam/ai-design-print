import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./style.css";

function App() {
  const [toolOn, setToolOn] = useState(true);

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>AI Design Tool</h1>
          <div>Backdrop • Biển quảng cáo • In ấn</div>
        </div>

        <div className="status">
          <span>{toolOn ? "ĐANG HOẠT ĐỘNG" : "ĐANG TẮT"}</span>

          <button
            className={toolOn ? "status-on" : "status-off"}
            onClick={() => setToolOn(!toolOn)}
          >
            {toolOn ? "ON" : "OFF"}
          </button>
        </div>
      </header>

      <main className="content">
        <h2>Thiết kế nhanh với AI</h2>

        <div className="tools">
          <div className="tool-card">
            <h3>🎨 Backdrop</h3>
            <p>Thiết kế backdrop sự kiện, trường học, khai giảng...</p>
            <button>Tạo thiết kế</button>
          </div>

          <div className="tool-card">
            <h3>🏪 Biển quảng cáo</h3>
            <p>Thiết kế biển hiệu, bảng quảng cáo, chữ nổi...</p>
            <button>Tạo thiết kế</button>
          </div>

          <div className="tool-card">
            <h3>🖨️ In ấn</h3>
            <p>Thiết kế theo kích thước thực tế để phục vụ in ấn.</p>
            <button>Tạo thiết kế</button>
          </div>

          <div className="tool-card">
            <h3>🤖 AI Design</h3>
            <p>Nhập yêu cầu và để AI hỗ trợ lên ý tưởng thiết kế.</p>
            <button>Bắt đầu</button>
          </div>
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
