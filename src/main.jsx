import React, { useState } from "react";
import { jsPDF } from "jspdf";
import ReactDOM from "react-dom/client";
import "./style.css";

function App() {
  const [toolOn, setToolOn] = useState(true);

  const [designType, setDesignType] = useState("Backdrop");
  const [width, setWidth] = useState("300");
  const [height, setHeight] = useState("270");
  const [unit, setUnit] = useState("cm");

  const [prompt, setPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [style, setStyle] = useState("Hiện đại");

  const [uploadedImage, setUploadedImage] = useState(null);

  const [generatedImage, setGeneratedImage] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [processingStep, setProcessingStep] = useState("");

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

  /*
   * =====================================================
   * UPLOAD
   * =====================================================
   */

  const handleUpload = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const imageUrl = URL.createObjectURL(file);

    setUploadedImage(imageUrl);
    setGeneratedImage(null);
    setError("");
    setProcessingStep("");
  };

  /*
   * =====================================================
   * KIỂM TRA TỶ LỆ
   * =====================================================
   */

  const getAspectRatio = (w, h) => {
    if (!w || !h) return 0;

    return Number(w) / Number(h);
  };

  const needsAspectProcessing = (w, h) => {
    const ratio = getAspectRatio(w, h);

    return ratio >= 2 || ratio <= 0.5;
  };

  /*
   * =====================================================
   * AI MỞ RỘNG ẢNH THEO TỶ LỆ THỰC
   *
   * Ví dụ:
   *
   * 400 × 70 cm
   *
   * Generate
   *    ↓
   * artwork ban đầu
   *    ↓
   * /api/edit
   *    ↓
   * AI mở rộng nền trái / phải
   *    ↓
   * ảnh cuối đúng tỷ lệ
   * =====================================================
   */

  const processAspectRatio = async (
    image,
    w,
    h
  ) => {
    if (!image) return image;

    if (!needsAspectProcessing(w, h)) {
      return image;
    }

    const ratio = getAspectRatio(w, h);

    setProcessingStep(
      `AI đang mở rộng thiết kế theo tỷ lệ ${w} × ${h} ${unit}...`
    );

    const aspectPrompt = `
FINAL PROFESSIONAL ASPECT-RATIO EXPANSION.

TARGET PRINT SIZE:
${w} × ${h} ${unit}

TARGET ASPECT RATIO:
${ratio.toFixed(4)}:1

This is a professional large-format advertising design.

The supplied artwork is the original central design.

IMPORTANT:

Preserve the original artwork.

DO NOT stretch the original image.

DO NOT squash the original image.

DO NOT distort:

- people
- faces
- bodies
- products
- vehicles
- logos
- typography
- letters
- numbers
- objects
- decorative elements

The central artwork must remain proportional.

The target format is an extremely wide advertising banner.

EXPAND THE ACTUAL DESIGN BACKGROUND NATURALLY.

For an ultra-wide design, extend the composition toward the LEFT and RIGHT.

Continue naturally:

- background
- colors
- gradients
- lighting
- shadows
- scenery
- textures
- decorative elements
- architectural elements
- abstract graphics

The expanded areas must look like they were originally designed as part of the same artwork.

Do NOT create:

- blurred side panels
- mirrored copies
- stretched copies
- duplicate people
- duplicate products
- duplicate logos
- duplicate typography
- empty white side strips
- artificial frames
- visible seams
- obvious AI extension borders

Do not redesign the central artwork.

Do not crop important content.

Keep the main subject in the safe central area.

The final image must look like ONE CONTINUOUS PROFESSIONAL ADVERTISING DESIGN.

The final output must be suitable for large-format printing at:

${w} × ${h} ${unit}

The final image must visually match the requested aspect ratio.

NO STRETCHING.
NO SQUASHING.
NO DISTORTION.
`;

    try {
      const response = await fetch("/api/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image,
          editPrompt: aspectPrompt,
          designType,
          targetWidth: w,
          targetHeight: h,
          width: w,
          height: h,
          unit,
          style,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể xử lý tỷ lệ thiết kế."
        );
      }

      if (!data.image) {
        throw new Error(
          "API không trả về ảnh sau khi xử lý tỷ lệ."
        );
      }

      return data.image;
    } catch (err) {
      throw new Error(
        err.message ||
          "Không thể mở rộng thiết kế theo tỷ lệ."
      );
    }
  };

  /*
   * =====================================================
   * GENERATE DESIGN
   * =====================================================
   */

  const handleCreate = async () => {
    if (!toolOn || generating) return;

    const w = Number(width);
    const h = Number(height);

    if (
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      setError(
        "Vui lòng nhập kích thước W × H hợp lệ."
      );
      return;
    }

    const aspectRatio = getAspectRatio(w, h);

    setGenerating(true);
    setGeneratedImage(null);
    setError("");
    setProcessingStep("AI đang tạo thiết kế...");

    try {
      /*
       * -------------------------------------------------
       * BƯỚC 1
       * GENERATE ARTWORK
       * -------------------------------------------------
       */

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          designType,
          width: w,
          height: h,
          unit,
          prompt,
          style,
          aspectRatio,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể tạo thiết kế."
        );
      }

      if (!data.image) {
        throw new Error(
          "AI không trả về hình ảnh."
        );
      }

      let finalImage = data.image;

      /*
       * -------------------------------------------------
       * BƯỚC 2
       * XỬ LÝ TỶ LỆ THỰC
       * -------------------------------------------------
       */

      if (needsAspectProcessing(w, h)) {
        finalImage =
          await processAspectRatio(
            data.image,
            w,
            h
          );
      } else {
        setProcessingStep(
          "Hoàn tất thiết kế."
        );
      }

      /*
       * -------------------------------------------------
       * BƯỚC 3
       * HIỂN THỊ ẢNH CUỐI
       * -------------------------------------------------
       */

      setGeneratedImage(finalImage);
      setProcessingStep("");

    } catch (err) {
      console.error(
        "CREATE ERROR:",
        err
      );

      setError(
        err.message ||
          "Có lỗi xảy ra khi tạo thiết kế."
      );

      setProcessingStep("");
    } finally {
      setGenerating(false);
    }
  };

  /*
   * =====================================================
   * EDIT DESIGN
   * =====================================================
   */

  const handleEdit = async () => {
    if (
      !toolOn ||
      generating ||
      !generatedImage ||
      !editPrompt.trim()
    ) {
      return;
    }

    const w = Number(width);
    const h = Number(height);

    setGenerating(true);
    setError("");
    setProcessingStep(
      "AI đang chỉnh sửa thiết kế..."
    );

    try {
      const response = await fetch(
        "/api/edit",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            image: generatedImage,
            editPrompt,
            designType,
            width: w,
            height: h,
            targetWidth: w,
            targetHeight: h,
            unit,
            style,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể chỉnh sửa thiết kế."
        );
      }

      if (!data.image) {
        throw new Error(
          "API không trả về ảnh chỉnh sửa."
        );
      }

      setGeneratedImage(data.image);
      setEditPrompt("");
      setProcessingStep("");

    } catch (err) {
      console.error(
        "EDIT ERROR:",
        err
      );

      setError(
        err.message ||
          "Có lỗi xảy ra khi chỉnh sửa."
      );

      setProcessingStep("");
    } finally {
      setGenerating(false);
    }
  };

  /*
   * =====================================================
   * ĐỔI KÍCH THƯỚC VỀ MM CHO PDF
   * =====================================================
   */

  const getSizeInMM = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    if (unit === "mm") {
      return numericValue;
    }

    if (unit === "cm") {
      return numericValue * 10;
    }

    if (unit === "m") {
      return numericValue * 1000;
    }

    return numericValue;
  };

  /*
   * =====================================================
   * DOWNLOAD PNG
   * =====================================================
   */

  const handleDownloadPNG = () => {
    if (!generatedImage) return;

    const link =
      document.createElement("a");

    link.href = generatedImage;

    link.download =
      `AI-Design-${designType}-${width}x${height}${unit}.png`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /*
   * =====================================================
   * DOWNLOAD PDF
   * =====================================================
   */

  const handleDownloadPDF = () => {
    if (!generatedImage) return;

    const wMM = getSizeInMM(width);
    const hMM = getSizeInMM(height);

    if (
      !wMM ||
      !hMM
    ) {
      setError(
        "Kích thước PDF không hợp lệ."
      );
      return;
    }

    const pdf = new jsPDF({
      orientation:
        wMM >= hMM
          ? "landscape"
          : "portrait",

      unit: "mm",

      format: [
        wMM,
        hMM,
      ],
    });

    pdf.addImage(
      generatedImage,
      "PNG",
      0,
      0,
      wMM,
      hMM
    );

    pdf.save(
      `AI-Design-${designType}-${width}x${height}-${unit}.pdf`
    );
  };

  /*
   * =====================================================
   * APP
   * =====================================================
   */

  return (
    <div
      className={`app ${
        toolOn ? "" : "tool-off"
      }`}
    >

      {/* TOP BAR */}

      <header className="topbar">

        <div className="logo-area">

          <div className="logo-mark">
            AI
          </div>

          <div>
            <div className="logo-title">
              AI DESIGN PRINT
            </div>

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
            className={`power-switch ${
              toolOn ? "active" : ""
            }`}
            onClick={() =>
              setToolOn(!toolOn)
            }
          >
            <span></span>

            {toolOn
              ? "ON"
              : "OFF"}
          </button>

        </div>

      </header>

      {/* MAIN */}

      <div className="studio">

        {/* LEFT SIDEBAR */}

        <aside className="sidebar">

          <div className="sidebar-heading">
            <span>CREATE</span>
            <small>01</small>
          </div>

          <div className="tool-list">

            {designTypes.map(
              (type, index) => (
                <button
                  key={type}
                  className={`tool-item ${
                    designType === type
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setDesignType(type)
                  }
                  disabled={!toolOn}
                >
                  <span className="tool-number">
                    {String(
                      index + 1
                    ).padStart(
                      2,
                      "0"
                    )}
                  </span>

                  <span>
                    {type}
                  </span>
                </button>
              )
            )}

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
              onChange={
                handleUpload
              }
              disabled={!toolOn}
            />

            <span className="upload-symbol">
              ↑
            </span>

            <span>
              <strong>
                Upload Image
              </strong>

              <small>
                PNG / JPG / WEBP
              </small>
            </span>

          </label>

          {uploadedImage && (
            <div className="asset-preview">
              <img
                src={uploadedImage}
                alt="Uploaded asset"
              />
            </div>
          )}

          <div className="sidebar-bottom">

            <div className="version">
              AI DESIGN PRINT
            </div>

            <div className="version-number">
              VERSION 1.0 PRO
            </div>

          </div>

        </aside>

        {/* CANVAS */}

        <main className="canvas-area">

          <div className="canvas-toolbar">

            <div className="canvas-title">

              <span>
                CANVAS
              </span>

              <strong>
                {designType}
              </strong>

            </div>

            <div className="canvas-tools">

              <button title="Undo">
                ↶
              </button>

              <button title="Redo">
                ↷
              </button>

              <span className="toolbar-divider"></span>

              <button title="Zoom out">
                −
              </button>

              <span className="zoom-value">
                100%
              </span>

              <button title="Zoom in">
                +
              </button>

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

            <div
              className="design-canvas"
              style={{
                aspectRatio: `${
                  Number(width) || 300
                } / ${
                  Number(height) || 270
                }`,
              }}
            >

              {/* GENERATING */}

              {generating ? (

                <div className="empty-canvas">

                  <div className="canvas-icon">
                    ✦
                  </div>

                  <div className="canvas-empty-title">
                    ĐANG TẠO THIẾT KẾ...
                  </div>

                  <div className="canvas-empty-text">
                    AI đang thiết kế{" "}
                    {designType}{" "}
                    {width} ×{" "}
                    {height}{" "}
                    {unit}
                  </div>

                  {processingStep && (
                    <div className="canvas-empty-text">
                      {processingStep}
                    </div>
                  )}

                  {needsAspectProcessing(
                    Number(width),
                    Number(height)
                  ) && (
                    <div className="canvas-empty-text">
                      Tối ưu ảnh theo tỷ lệ in thực tế...
                    </div>
                  )}

                </div>

              ) : error ? (

                <div className="empty-canvas">

                  <div className="canvas-icon">
                    !
                  </div>

                  <div className="canvas-empty-title">
                    KHÔNG THỂ TẠO THIẾT KẾ
                  </div>

                  <div className="canvas-empty-text">
                    {error}
                  </div>

                </div>

              ) : generatedImage ? (

                <div
                  className="generated-result"
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection:
                      "column",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    overflow:
                      "hidden",
                  }}
                >

                  <div
                    className="generated-image-wrap"
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "center",
                      overflow:
                        "hidden",
                    }}
                  >

                    <img
                      src={
                        generatedImage
                      }
                      className="canvas-image"
                      alt="AI generated design"
                      style={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        maxWidth:
                          "100%",
                        maxHeight:
                          "100%",
                        objectFit:
                          "contain",
                        objectPosition:
                          "center",
                      }}
                    />

                  </div>

                  {/* ACTIONS */}

                  <div className="generated-actions">

                    <button
                      className="download-button"
                      onClick={
                        handleDownloadPNG
                      }
                    >
                      ↓ TẢI XUỐNG PNG
                    </button>

                    <button
                      className="download-button"
                      onClick={
                        handleDownloadPDF
                      }
                    >
                      ↓ TẢI XUỐNG PDF
                    </button>

                    <div className="edit-design-box">

                      <textarea
                        className="edit-design-input"
                        placeholder="Nhập yêu cầu chỉnh sửa thiết kế..."
                        rows="3"
                        value={
                          editPrompt
                        }
                        onChange={(e) =>
                          setEditPrompt(
                            e.target.value
                          )
                        }
                      />

                      <button
                        className="download-button"
                        onClick={
                          handleEdit
                        }
                        disabled={
                          !editPrompt.trim() ||
                          generating
                        }
                      >
                        ✦ CHỈNH SỬA THIẾT KẾ
                      </button>

                    </div>

                  </div>

                </div>

              ) : uploadedImage ? (

                <img
                  src={
                    uploadedImage
                  }
                  className="canvas-image"
                  alt="Uploaded design"
                  style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    maxWidth:
                      "100%",
                    maxHeight:
                      "100%",
                    objectFit:
                      "contain",
                    objectPosition:
                      "center",
                  }}
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
                    {width ||
                      "300"}{" "}
                    ×{" "}
                    {height ||
                      "270"}{" "}
                    {unit}
                  </div>

                </div>

              )}

            </div>

          </div>

          <div className="canvas-bottom">

            <div>
              <span>
                DOCUMENT
              </span>

              <strong>
                {width ||
                  "--"}{" "}
                ×{" "}
                {height ||
                  "--"}{" "}
                {unit}
              </strong>
            </div>

            <div>
              <span>
                TYPE
              </span>

              <strong>
                {designType}
              </strong>
            </div>

            <div>
              <span>
                STATUS
              </span>

              <strong className="ready">
                {generating
                  ? "PROCESSING"
                  : "READY"}
              </strong>
            </div>

          </div>

        </main>

        {/* RIGHT PANEL */}

        <aside className="properties">

          <div className="properties-header">

            <div>

              <span>
                AI DESIGN
              </span>

              <h2>
                Properties
              </h2>

            </div>

            <div className="properties-icon">
              ✦
            </div>

          </div>

          {/* SIZE */}

          <section className="property-section">

            <div className="property-heading">

              <span>
                01
              </span>

              <strong>
                Canvas Size
              </strong>

            </div>

            <div className="size-inputs">

              <label>

                <span>
                  W
                </span>

                <input
                  type="number"
                  value={width}
                  onChange={(e) =>
                    setWidth(
                      e.target.value
                    )
                  }
                  disabled={!toolOn}
                />

              </label>

              <span className="multiply">
                ×
              </span>

              <label>

                <span>
                  H
                </span>

                <input
                  type="number"
                  value={height}
                  onChange={(e) =>
                    setHeight(
                      e.target.value
                    )
                  }
                  disabled={!toolOn}
                />

              </label>

              <select
                value={unit}
                onChange={(e) =>
                  setUnit(
                    e.target.value
                  )
                }
                disabled={!toolOn}
              >

                <option value="mm">
                  mm
                </option>

                <option value="cm">
                  cm
                </option>

                <option value="m">
                  m
                </option>

              </select>

            </div>

          </section>

          {/* PROMPT */}

          <section className="property-section">

            <div className="property-heading">

              <span>
                02
              </span>

              <strong>
                Design Brief
              </strong>

            </div>

            <textarea
              className="ai-prompt"
              placeholder={
                "Mô tả thiết kế bạn muốn tạo...\n\nVí dụ: Backdrop khai giảng trường mầm non, màu sắc vui tươi, có hình các em nhỏ..."
              }
              value={prompt}
              onChange={(e) =>
                setPrompt(
                  e.target.value
                )
              }
              disabled={!toolOn}
            />

          </section>

          {/* STYLE */}

          <section className="property-section">

            <div className="property-heading">

              <span>
                03
              </span>

              <strong>
                Visual Style
              </strong>

            </div>

            <div className="style-grid">

              {styles.map(
                (item) => (
                  <button
                    key={item}
                    className={
                      style === item
                        ? "style active"
                        : "style"
                    }
                    onClick={() =>
                      setStyle(
                        item
                      )
                    }
                    disabled={
                      !toolOn
                    }
                  >
                    {item}
                  </button>
                )
              )}

            </div>

          </section>

          {/* GENERATE */}

          <button
            className="generate-button"
            onClick={
              handleCreate
            }
            disabled={
              !toolOn ||
              generating
            }
          >

            <span className="generate-icon">
              ✦
            </span>

            <span>

              <strong>
                {generating
                  ? "GENERATING..."
                  : "GENERATE DESIGN"}
              </strong>

              <small>
                CREATE WITH AI
              </small>

            </span>

            <span className="arrow">
              →
            </span>

          </button>

          {/* EXPORT */}

          <section className="export-section">

            <div className="property-heading">

              <span>
                04
              </span>

              <strong>
                Export
              </strong>

            </div>

            <div className="export-grid">

              <button
                disabled={
                  !generatedImage
                }
                onClick={
                  handleDownloadPNG
                }
              >
                <strong>
                  PNG
                </strong>

                <small>
                  IMAGE
                </small>
              </button>

              <button disabled>
                <strong>
                  JPG
                </strong>

                <small>
                  IMAGE
                </small>
              </button>

              <button
                disabled={
                  !generatedImage
                }
                onClick={
                  handleDownloadPDF
                }
              >
                <strong>
                  PDF
                </strong>

                <small>
                  PRINT
                </small>
              </button>

              <button disabled>
                <strong>
                  SVG
                </strong>

                <small>
                  VECTOR
                </small>
              </button>

              <button
                className="cdr-button"
                disabled
              >
                <strong>
                  CDR
                </strong>

                <small>
                  COREL
                </small>
              </button>

            </div>

          </section>

        </aside>

      </div>

      {/* FOOTER */}

      <footer className="footer">

        <span>
          AI DESIGN PRINT
        </span>

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

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
