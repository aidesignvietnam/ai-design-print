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
  const [designPlan, setDesignPlan] = useState(null);

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
   * =========================================================
   * ĐỌC ẢNH THÀNH DATA URL
   * =========================================================
   */

  const readImageAsDataURL = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result);
      };

      reader.onerror = () => {
        reject(
          new Error("Không thể đọc hình ảnh.")
        );
      };

      reader.readAsDataURL(file);
    });
  };

  /*
   * =========================================================
   * UPLOAD IMAGE
   * =========================================================
   */

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError(
        "Vui lòng chọn file hình ảnh JPG, PNG hoặc WEBP."
      );
      return;
    }

    try {
      setError("");
      setProcessingStep(
        "Đang đọc hình ảnh tham khảo..."
      );

      const imageData =
        await readImageAsDataURL(file);

      setUploadedImage(imageData);

      setGeneratedImage(null);
      setDesignPlan(null);

      setProcessingStep("");

      console.log(
        "Reference image loaded:",
        file.name,
        file.type,
        file.size
      );
    } catch (err) {
      console.error(
        "UPLOAD IMAGE ERROR:",
        err
      );

      setError(
        err?.message ||
          "Không thể tải hình ảnh."
      );

      setProcessingStep("");
    }
  };

  /*
   * =========================================================
   * ASPECT RATIO
   * =========================================================
   */

  const getAspectRatio = (w, h) => {
    if (!w || !h) {
      return 0;
    }

    return Number(w) / Number(h);
  };

  const needsAspectExpansion = (ratio) => {
    return ratio >= 2.5 || ratio <= 0.7;
  };

  /*
   * =========================================================
   * CREATE DESIGN
   * =========================================================
   */

  const handleCreate = async () => {
    if (!toolOn || generating) {
      return;
    }

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

    if (!prompt.trim()) {
      setError(
        "Vui lòng nhập nội dung yêu cầu thiết kế."
      );
      return;
    }

    const aspectRatio =
      getAspectRatio(w, h);

    const requiresExpansion =
      needsAspectExpansion(
        aspectRatio
      );

    setGenerating(true);
    setGeneratedImage(null);
    setDesignPlan(null);
    setError("");

    if (uploadedImage) {
      setProcessingStep(
        "AI đang phân tích ảnh tham khảo..."
      );
    } else {
      setProcessingStep(
        "AI ART DIRECTOR đang phân tích yêu cầu..."
      );
    }

    try {
      /*
       * =====================================================
       * STEP 1 — AI ART DIRECTOR
       * =====================================================
       */

      const planResponse =
        await fetch("/api/plan", {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            designType,
            width: w,
            height: h,
            unit,
            prompt,
            style,
            aspectRatio,

            uploadedImage:
              uploadedImage || null,
          }),
        });

      const planText =
        await planResponse.text();

      let planData = {};

      try {
        planData = planText
          ? JSON.parse(planText)
          : {};
      } catch (parseError) {
        console.error(
          "PLAN JSON ERROR:",
          parseError
        );

        throw new Error(
          planText ||
            "AI ART DIRECTOR không trả về JSON hợp lệ."
        );
      }

      if (!planResponse.ok) {
        throw new Error(
          planData.error ||
            "AI ART DIRECTOR không thể phân tích yêu cầu."
        );
      }

      if (!planData.designPlan) {
        throw new Error(
          "AI ART DIRECTOR không trả về Design Plan."
        );
      }

      const currentDesignPlan =
        planData.designPlan;

      setDesignPlan(
        currentDesignPlan
      );

      /*
       * Không dùng template literal ở đây
       * để tránh lỗi cú pháp.
       */

      if (uploadedImage) {
        setProcessingStep(
          "AI đã phân tích ảnh mẫu. Đang tạo concept: " +
            (
              currentDesignPlan.concept ||
              "thiết kế phù hợp"
            )
        );
      } else {
        setProcessingStep(
          "AI đang tạo concept: " +
            (
              currentDesignPlan.concept ||
              "thiết kế phù hợp yêu cầu"
            )
        );
      }

      /*
       * =====================================================
       * STEP 2 — AI GENERATOR
       * =====================================================
       */

      const generateResponse =
        await fetch("/api/generate", {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            designType,
            width: w,
            height: h,
            unit,
            prompt,
            style,
            aspectRatio,

            designPlan:
              currentDesignPlan,

            /*
             * Gửi ảnh tham khảo thật
             * cho API generate.
             */

            uploadedImage:
              uploadedImage || null,
          }),
        });

      const generateText =
        await generateResponse.text();

      let generateData = {};

      try {
        generateData = generateText
          ? JSON.parse(generateText)
          : {};
      } catch (parseError) {
        console.error(
          "GENERATE JSON ERROR:",
          parseError
        );

        throw new Error(
          generateText ||
            "Server không trả về dữ liệu JSON hợp lệ."
        );
      }

      if (!generateResponse.ok) {
        throw new Error(
          generateData.error ||
            "Không thể tạo thiết kế."
        );
      }

      if (!generateData.image) {
        throw new Error(
          "AI không trả về hình ảnh."
        );
      }

      let finalImage =
        generateData.image;

      /*
       * =====================================================
       * STEP 3 — EXPAND WIDE / TALL DESIGN
       * =====================================================
       */

      if (requiresExpansion) {
        setProcessingStep(
          "AI đang mở rộng thiết kế theo đúng bố cục " +
            w +
            " × " +
            h +
            " " +
            unit +
            "..."
        );

        const editResponse =
          await fetch("/api/edit", {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              image:
                finalImage,

              editPrompt:
                "Mở rộng thiết kế theo đúng tỷ lệ kích thước yêu cầu và theo Design Plan. Giữ nguyên hierarchy, chủ thể chính, phong cách, màu sắc và nội dung quan trọng. Không nhân đôi người, sản phẩm, logo hoặc chữ. Không tạo bố cục 3 panel. Không biến thiết kế thành một cụm nhỏ ở giữa. Chỉ mở rộng nền, môi trường và các visual phụ một cách tự nhiên để tận dụng toàn bộ canvas.",

              content:
                prompt,

              designType,

              width: w,
              height: h,

              targetWidth: w,
              targetHeight: h,

              unit,
              style,

              designPlan:
                currentDesignPlan,

              uploadedImage:
                uploadedImage || null,
            }),
          });

        const editText =
          await editResponse.text();

        let editData = {};

        try {
          editData = editText
            ? JSON.parse(editText)
            : {};
        } catch (parseError) {
          console.error(
            "EXPAND JSON ERROR:",
            parseError
          );

          throw new Error(
            editText ||
              "Server mở rộng ảnh không trả về JSON hợp lệ."
          );
        }

        if (!editResponse.ok) {
          throw new Error(
            editData.error ||
              "Không thể mở rộng thiết kế."
          );
        }

        if (!editData.image) {
          throw new Error(
            "AI không trả về ảnh sau khi mở rộng."
          );
        }

        finalImage =
          editData.image;
      }

      /*
       * =====================================================
       * HIỂN THỊ KẾT QUẢ
       * =====================================================
       */

      setGeneratedImage(
        finalImage
      );

      if (requiresExpansion) {
        setProcessingStep(
          "Đã tạo và mở rộng thiết kế hoàn tất."
        );
      } else {
        setProcessingStep(
          "Hoàn tất thiết kế."
        );
      }

      setTimeout(() => {
        setProcessingStep("");
      }, 1000);
    } catch (err) {
      console.error(
        "CREATE ERROR:",
        err
      );

      setError(
        err?.message ||
          "Có lỗi xảy ra khi tạo thiết kế."
      );

      setProcessingStep("");
    } finally {
      setGenerating(false);
    }
  };

  /*
   * =========================================================
   * AI EDIT
   * =========================================================
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
      const response =
        await fetch("/api/edit", {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            image:
              generatedImage,

            editPrompt,

            content:
              prompt,

            designType,

            width: w,
            height: h,

            targetWidth: w,
            targetHeight: h,

            unit,
            style,

            uploadedImage:
              uploadedImage || null,

            designPlan:
              designPlan || null,
          }),
        });

      const responseText =
        await response.text();

      let data = {};

      try {
        data = responseText
          ? JSON.parse(responseText)
          : {};
      } catch (parseError) {
        console.error(
          "EDIT JSON ERROR:",
          parseError
        );

        throw new Error(
          responseText ||
            "Server không trả về dữ liệu JSON hợp lệ."
        );
      }

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

      setGeneratedImage(
        data.image
      );

      setEditPrompt("");

      setProcessingStep("");
    } catch (err) {
      console.error(
        "EDIT ERROR:",
        err
      );

      setError(
        err?.message ||
          "Có lỗi xảy ra khi chỉnh sửa."
      );

      setProcessingStep("");
    } finally {
      setGenerating(false);
    }
  };

  /*
   * =========================================================
   * SIZE TO MM
   * =========================================================
   */

  const getSizeInMM = (value) => {
    const numericValue =
      Number(value);

    if (
      !Number.isFinite(
        numericValue
      )
    ) {
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
   * =========================================================
   * DOWNLOAD PNG
   * =========================================================
   */

  const handleDownloadPNG = () => {
    if (!generatedImage) {
      return;
    }

    const link =
      document.createElement(
        "a"
      );

    link.href =
      generatedImage;

    link.download =
      "AI-Design-" +
      designType +
      "-" +
      width +
      "x" +
      height +
      unit +
      ".png";

    document.body.appendChild(
      link
    );

    link.click();

    document.body.removeChild(
      link
    );
  };

  /*
   * =========================================================
   * DOWNLOAD PDF
   * =========================================================
   */

  const handleDownloadPDF = () => {
    if (!generatedImage) {
      return;
    }

    const wMM =
      getSizeInMM(width);

    const hMM =
      getSizeInMM(height);

    if (!wMM || !hMM) {
      setError(
        "Kích thước PDF không hợp lệ."
      );

      return;
    }

    const pdf =
      new jsPDF({
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
      "AI-Design-" +
        designType +
        "-" +
        width +
        "x" +
        height +
        "-" +
        unit +
        ".pdf"
    );
  };

  /*
   * =========================================================
   * UI
   * =========================================================
   */

  return (
    <div
      className={
        "app " +
        (toolOn
          ? ""
          : "tool-off")
      }
    >
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
            className={
              "power-switch " +
              (toolOn
                ? "active"
                : "")
            }
            onClick={() =>
              setToolOn(
                !toolOn
              )
            }
          >
            <span></span>

            {toolOn
              ? "ON"
              : "OFF"}
          </button>
        </div>
      </header>

      <div className="studio">

        {/* =================================================
            SIDEBAR
        ================================================= */}

        <aside className="sidebar">

          <div className="sidebar-heading">
            <span>
              CREATE
            </span>

            <small>
              01
            </small>
          </div>

          <div className="tool-list">
            {designTypes.map(
              (
                type,
                index
              ) => (
                <button
                  key={
                    type
                  }
                  className={
                    "tool-item " +
                    (designType ===
                    type
                      ? "selected"
                      : "")
                  }
                  onClick={() =>
                    setDesignType(
                      type
                    )
                  }
                  disabled={
                    !toolOn
                  }
                >
                  <span className="tool-number">
                    {String(
                      index +
                        1
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
            <span>
              ASSETS
            </span>

            <small>
              02
            </small>
          </div>

          <label className="upload-button">

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              onChange={
                handleUpload
              }
              disabled={
                !toolOn
              }
            />

            <span className="upload-symbol">
              ↑
            </span>

            <span>
              <strong>
                Upload Image
              </strong>

              <small>
                JPG / PNG / WEBP
              </small>
            </span>

          </label>

          {uploadedImage && (
            <div className="asset-preview">
              <img
                src={
                  uploadedImage
                }
                alt="Reference"
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

        {/* =================================================
            CANVAS
        ================================================= */}

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

              <span>
                0
              </span>

              <span>
                50
              </span>

              <span>
                100
              </span>

              <span>
                150
              </span>

              <span>
                200
              </span>

              <span>
                250
              </span>

              <span>
                300
              </span>

            </div>

            <div className="canvas-ruler vertical">

              <span>
                0
              </span>

              <span>
                50
              </span>

              <span>
                100
              </span>

              <span>
                150
              </span>

              <span>
                200
              </span>

              <span>
                250
              </span>

            </div>

            <div
              className="design-canvas"
              style={{
                aspectRatio:
                  (Number(width) ||
                    300) +
                  " / " +
                  (Number(height) ||
                    270),
              }}
            >

              {/* =================================================
                  GENERATING
              ================================================= */}

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

                </div>

              ) : error ? (

                /* =================================================
                   ERROR
                ================================================= */

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

                /* =================================================
                   GENERATED IMAGE
                ================================================= */

                <div className="generated-result">

                  <img
                    src={
                      generatedImage
                    }
                    className="canvas-image"
                    alt="AI generated design"
                  />

                  <div className="canvas-download-menu">

                    <button
                      className="canvas-download-trigger"
                      title="Tải xuống"
                    >
                      ↓
                    </button>

                    <div className="canvas-download-dropdown">

                      <button
                        onClick={
                          handleDownloadPNG
                        }
                      >
                        <span>
                          PNG
                        </span>

                        <small>
                          HÌNH ẢNH
                        </small>
                      </button>

                      <button
                        onClick={
                          handleDownloadPDF
                        }
                      >
                        <span>
                          PDF
                        </span>

                        <small>
                          IN ẤN
                        </small>
                      </button>

                    </div>

                  </div>

                </div>

              ) : uploadedImage ? (

                /* =================================================
                   REFERENCE IMAGE
                ================================================= */

                <img
                  src={
                    uploadedImage
                  }
                  className="canvas-image"
                  alt="Reference design"
                />

              ) : (

                /* =================================================
                   EMPTY CANVAS
                ================================================= */

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

          {/* =================================================
              AI EDIT
          ================================================= */}

          {generatedImage && (

            <div className="edit-design-panel">

              <div className="edit-design-label">

                <span>
                  AI EDIT
                </span>

                <small>
                  CHỈNH SỬA THIẾT KẾ
                </small>

              </div>

              <textarea
                className="edit-design-input"
                placeholder="Nhập yêu cầu chỉnh sửa thiết kế..."
                rows="2"
                value={
                  editPrompt
                }
                onChange={(e) =>
                  setEditPrompt(
                    e.target.value
                  )
                }
                disabled={
                  !toolOn
                }
              />

              <button
                className="edit-design-button"
                onClick={
                  handleEdit
                }
                disabled={
                  !toolOn ||
                  !editPrompt.trim() ||
                  generating
                }
              >
                {generating
                  ? "ĐANG XỬ LÝ..."
                  : "✦ CHỈNH SỬA"}
              </button>

            </div>

          )}

          {/* =================================================
              CANVAS BOTTOM
          ================================================= */}

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

        {/* =================================================
            PROPERTIES
        ================================================= */}

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

          {/* =================================================
              CANVAS SIZE
          ================================================= */}

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
                  value={
                    width
                  }
                  onChange={(e) =>
                    setWidth(
                      e.target.value
                    )
                  }
                  disabled={
                    !toolOn
                  }
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
                  value={
                    height
                  }
                  onChange={(e) =>
                    setHeight(
                      e.target.value
                    )
                  }
                  disabled={
                    !toolOn
                  }
                />

              </label>

              <select
                value={
                  unit
                }
                onChange={(e) =>
                  setUnit(
                    e.target.value
                  )
                }
                disabled={
                  !toolOn
                }
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

          {/* =================================================
              DESIGN BRIEF
          ================================================= */}

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
              value={
                prompt
              }
              onChange={(e) =>
                setPrompt(
                  e.target.value
                )
              }
              disabled={
                !toolOn
              }
            />

          </section>

          {/* =================================================
              VISUAL STYLE
          ================================================= */}

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
                    key={
                      item
                    }
                    className={
                      style ===
                      item
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

          {/* =================================================
              GENERATE BUTTON
          ================================================= */}

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

          {/* =================================================
              EXPORT
          ================================================= */}

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

      {/* =================================================
          FOOTER
      ================================================= */}

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

/*
 * =========================================================
 * REACT ROOT
 * =========================================================
 */

ReactDOM.createRoot(
  document.getElementById(
    "root"
  )
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
