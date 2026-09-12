import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import ImageTracer from "imagetracerjs";
import { createRoot } from "react-dom/client";
import { jsPDF } from "jspdf";
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
  const [uploadedImageForAPI, setUploadedImageForAPI] =
    useState(null);

  const [generatedImage, setGeneratedImage] = useState(null);
  const [designPlan, setDesignPlan] = useState(null);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [processingStep, setProcessingStep] = useState("");
  
const [downloadOpen, setDownloadOpen] = useState(false);

const downloadMenuRef = useRef(null);

/* =========================================================
   AI UPSCALE
========================================================= */

const [upscaleImage, setUpscaleImage] =
  useState(null);

const [upscaleResult, setUpscaleResult] =
  useState(null);

const [upscaleScale, setUpscaleScale] =
  useState(2);

const [upscaleMode, setUpscaleMode] =
  useState("standard");

const [upscaling, setUpscaling] =
  useState(false);

const [upscaleInfo, setUpscaleInfo] =
  useState(null);

const [upscaleError, setUpscaleError] =
  useState("");
  
const [vectorizing, setVectorizing] = useState(false);
const [vectorError, setVectorError] = useState("");

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

  /* =========================================================
     DOWNLOAD MENU
  ========================================================= */

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        downloadMenuRef.current &&
        !downloadMenuRef.current.contains(event.target)
      ) {
        setDownloadOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setDownloadOpen(false);
      }
    };

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, []);

  /* =========================================================
     READ IMAGE
  ========================================================= */

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

  /* =========================================================
     COMPRESS IMAGE FOR API

     Ảnh gốc:
     - giữ nguyên trong uploadedImage / generatedImage

     Ảnh API:
     - giảm kích thước
     - chuyển JPEG
     - giảm payload
  ========================================================= */

  const compressImageForAPI = (
    dataURL,
    maxDimension = 1600
  ) => {
    return new Promise((resolve) => {
      if (!dataURL) {
        resolve(null);
        return;
      }

      if (
        typeof dataURL !== "string" ||
        !dataURL.startsWith("data:image/")
      ) {
        resolve(dataURL);
        return;
      }

      const image = new Image();

      image.onload = () => {
        try {
          const originalWidth =
            image.naturalWidth || image.width;

          const originalHeight =
            image.naturalHeight || image.height;

          if (
            !originalWidth ||
            !originalHeight
          ) {
            resolve(dataURL);
            return;
          }

          const largestSide = Math.max(
            originalWidth,
            originalHeight
          );

          const scale =
            largestSide > maxDimension
              ? maxDimension / largestSide
              : 1;

          const targetWidth = Math.max(
            1,
            Math.round(
              originalWidth * scale
            )
          );

          const targetHeight = Math.max(
            1,
            Math.round(
              originalHeight * scale
            )
          );

          const canvas =
            document.createElement("canvas");

          canvas.width = targetWidth;
          canvas.height = targetHeight;

          const context =
            canvas.getContext("2d");

          if (!context) {
            resolve(dataURL);
            return;
          }

          context.drawImage(
            image,
            0,
            0,
            targetWidth,
            targetHeight
          );

          let quality = 0.78;

          let compressed =
            canvas.toDataURL(
              "image/jpeg",
              quality
            );

          const maxDataURLLength =
            2.5 * 1024 * 1024;

          while (
            compressed.length >
              maxDataURLLength &&
            quality > 0.45
          ) {
            quality -= 0.08;

            compressed =
              canvas.toDataURL(
                "image/jpeg",
                quality
              );
          }

          console.log(
            "IMAGE COMPRESSED FOR API",
            {
              originalWidth,
              originalHeight,
              targetWidth,
              targetHeight,
              quality,
              originalSize:
                dataURL.length,
              compressedSize:
                compressed.length,
            }
          );

          resolve(compressed);
        } catch (compressionError) {
          console.error(
            "IMAGE COMPRESSION ERROR:",
            compressionError
          );

          resolve(dataURL);
        }
      };

      image.onerror = () => {
        console.warn(
          "Không thể nén ảnh. Sử dụng ảnh gốc."
        );

        resolve(dataURL);
      };

      image.src = dataURL;
    });
  };

  /* =========================================================
     UPLOAD
  ========================================================= */

  const handleUpload = async (event) => {
    const file =
      event.target.files &&
      event.target.files[0];

    if (!file) {
      return;
    }

    if (
      !file.type.startsWith("image/")
    ) {
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

      setProcessingStep(
        "Đang tối ưu ảnh tham khảo..."
      );

      const apiImage =
        await compressImageForAPI(
          imageData,
          1600
        );

      setUploadedImageForAPI(apiImage);

      setGeneratedImage(null);
      setDesignPlan(null);
      setDownloadOpen(false);
      setProcessingStep("");
    } catch (uploadError) {
      console.error(
        "UPLOAD IMAGE ERROR:",
        uploadError
      );

      setError(
        uploadError?.message ||
          "Không thể tải hình ảnh."
      );

      setProcessingStep("");
    }
  };

 /* =========================================================
   AI KÍCH NÉT ẢNH
========================================================= */

const handleUpscaleUpload = async (event) => {
  const file =
    event.target.files &&
    event.target.files[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    setUpscaleError(
      "Vui lòng chọn file JPG, PNG hoặc WEBP."
    );
    return;
  }

  try {
    setUpscaleError("");
    setUpscaleResult(null);
    setUpscaleInfo(null);

    const imageData =
      await readImageAsDataURL(file);

    setUpscaleImage(imageData);
  } catch (uploadError) {
    console.error(
      "UPSCALE UPLOAD ERROR:",
      uploadError
    );

    setUpscaleError(
      "Không thể đọc hình ảnh."
    );
  }
};

const handleUpscale = async () => {
  if (
    !toolOn ||
    upscaling ||
    !upscaleImage
  ) {
    return;
  }

  setUpscaling(true);
  setUpscaleError("");
  setUpscaleResult(null);
  setUpscaleInfo(null);

  try {
    const apiImage =
      await compressImageForAPI(
        upscaleImage,
        2200
      );

    setProcessingStep(
      "AI đang kích nét và phục hồi chi tiết ảnh..."
    );

    const response =
      await fetch("/api/upscale", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          image: apiImage,
          scale: upscaleScale,
          mode: upscaleMode,
        }),
      });

    if (!response.ok) {
      let message =
        "Không thể kích nét ảnh.";

      try {
        const errorData =
          await response.json();

        message =
          errorData.error ||
          message;
      } catch {
        // Giữ thông báo mặc định
      }

      throw new Error(message);
    }

    const blob =
      await response.blob();

    if (!blob.size) {
      throw new Error(
        "Ảnh sau khi kích nét không có dữ liệu."
      );
    }

    const resultURL =
      URL.createObjectURL(blob);

    const originalWidth =
      response.headers.get(
        "X-Original-Width"
      );

    const originalHeight =
      response.headers.get(
        "X-Original-Height"
      );

    const outputWidth =
      response.headers.get(
        "X-Output-Width"
      );

    const outputHeight =
      response.headers.get(
        "X-Output-Height"
      );

    setUpscaleResult(resultURL);

    setUpscaleInfo({
      originalWidth:
        originalWidth || "?",
      originalHeight:
        originalHeight || "?",
      outputWidth:
        outputWidth || "?",
      outputHeight:
        outputHeight || "?",
      scale:
        response.headers.get(
          "X-Scale"
        ) || upscaleScale,
      mode:
        response.headers.get(
          "X-Mode"
        ) || upscaleMode,
    });

    setProcessingStep("");

  } catch (upscaleErrorValue) {
    console.error(
      "UPSCALE ERROR:",
      upscaleErrorValue
    );

    setUpscaleError(
      upscaleErrorValue?.message ||
        "Không thể kích nét ảnh."
    );

    setProcessingStep("");

  } finally {
    setUpscaling(false);
  }
};

const handleDownloadUpscale = () => {
  if (!upscaleResult) {
    return;
  }

  const link =
    document.createElement("a");

  link.href = upscaleResult;

  link.download =
    "AI-Kich-Net-" +
    upscaleScale +
    "x.png";

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);
};
   /* =========================================================
     ASPECT
  ========================================================= */
  const getAspectRatio = (w, h) => {
    if (!w || !h) {
      return 0;
    }

    return Number(w) / Number(h);
  };

  const needsAspectExpansion = (ratio) => {
    return ratio >= 2.5 || ratio <= 0.7;
  };

  const getCanvasRatioClass = () => {
    const w = Number(width);
    const h = Number(height);

    if (
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      return "";
    }

    const ratio = w / h;

    if (ratio >= 4) {
      return "canvas-ultra-wide";
    }

    if (ratio >= 2.5) {
      return "canvas-wide";
    }

    if (ratio <= 0.7) {
      return "canvas-tall";
    }

    return "canvas-standard";
  };

  /* =========================================================
     CREATE DESIGN
  ========================================================= */

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
    setDownloadOpen(false);
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
      const referenceImageForAPI =
        uploadedImageForAPI ||
        uploadedImage ||
        null;

      /* =====================================================
         STEP 1 - PLAN
      ===================================================== */

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
              referenceImageForAPI,
          }),
        });

      const planText =
        await planResponse.text();

      let planData = {};

      try {
        planData = planText
          ? JSON.parse(planText)
          : {};
      } catch {
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

      setProcessingStep(
        "AI đang tạo concept: " +
          (
            currentDesignPlan.concept ||
            "thiết kế phù hợp"
          )
      );

      /* =====================================================
         STEP 2 - GENERATE
      ===================================================== */

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
            uploadedImage:
              referenceImageForAPI,
          }),
        });

      const generateText =
        await generateResponse.text();

      let generateData = {};

      try {
        generateData = generateText
          ? JSON.parse(generateText)
          : {};
      } catch {
        throw new Error(
          generateText ||
            "Server không trả về JSON hợp lệ."
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

      /* =====================================================
         STEP 3 - EXPAND WIDE / TALL
      ===================================================== */

      if (requiresExpansion) {
        setProcessingStep(
          "AI đang mở rộng thiết kế theo đúng tỷ lệ " +
            w +
            " × " +
            h +
            " " +
            unit +
            "..."
        );

        const editImageForAPI =
          await compressImageForAPI(
            finalImage,
            1600
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
                editImageForAPI,

              editPrompt:
                "Mở rộng thiết kế theo đúng tỷ lệ kích thước yêu cầu và theo Design Plan. Giữ nguyên hierarchy, chủ thể chính, phong cách, màu sắc và nội dung quan trọng. Không nhân đôi người, sản phẩm, logo hoặc chữ. Không tạo bố cục 3 panel. Không biến thiết kế thành một cụm nhỏ ở giữa. Chỉ mở rộng nền, môi trường và các visual phụ một cách tự nhiên để tận dụng toàn bộ canvas.",

              content: prompt,

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
                referenceImageForAPI,
            }),
          });

        const editText =
          await editResponse.text();

        let editData = {};

        try {
          editData = editText
            ? JSON.parse(editText)
            : {};
        } catch {
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

      setGeneratedImage(
        finalImage
      );

      setDownloadOpen(false);

      setProcessingStep(
        "Đã tạo thiết kế hoàn tất."
      );

      window.setTimeout(() => {
        setProcessingStep("");
      }, 1000);
    } catch (createError) {
      console.error(
        "CREATE ERROR:",
        createError
      );

      setError(
        createError?.message ||
          "Có lỗi xảy ra khi tạo thiết kế."
      );

      setProcessingStep("");
    } finally {
      setGenerating(false);
    }
  };

  /* =========================================================
     AI EDIT
  ========================================================= */

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
    setDownloadOpen(false);

    setProcessingStep(
      "AI đang tối ưu ảnh để chỉnh sửa..."
    );

    try {
      const editImageForAPI =
        await compressImageForAPI(
          generatedImage,
          1600
        );

      const referenceImageForAPI =
        uploadedImageForAPI ||
        uploadedImage ||
        null;

      setProcessingStep(
        "AI đang chỉnh sửa thiết kế..."
      );

      const response =
        await fetch("/api/edit", {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            image:
              editImageForAPI,

            editPrompt,

            content: prompt,

            designType,

            width: w,
            height: h,

            targetWidth: w,
            targetHeight: h,

            unit,
            style,

            uploadedImage:
              referenceImageForAPI,

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
      } catch {
        throw new Error(
          responseText ||
            "Server không trả về JSON hợp lệ."
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
      setDownloadOpen(false);
    } catch (editError) {
      console.error(
        "EDIT ERROR:",
        editError
      );

      setError(
        editError?.message ||
          "Có lỗi xảy ra khi chỉnh sửa."
      );

      setProcessingStep("");
    } finally {
      setGenerating(false);
    }
  };

  /* =========================================================
     PDF
  ========================================================= */

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

  /* =========================================================
     DOWNLOAD PNG
  ========================================================= */

  const handleDownloadPNG = () => {
    if (!generatedImage) {
      return;
    }

    const link =
      document.createElement("a");

    link.href = generatedImage;

    link.download =
      "AI-Design-" +
      designType +
      "-" +
      width +
      "x" +
      height +
      unit +
      ".png";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadOpen(false);
  };

  /* =========================================================
     DOWNLOAD PDF
  ========================================================= */

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

    try {
      const pdf =
        new jsPDF({
          orientation:
            wMM >= hMM
              ? "landscape"
              : "portrait",
          unit: "mm",
          format: [wMM, hMM],
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

      setDownloadOpen(false);
    } catch (pdfError) {
      console.error(
        "PDF ERROR:",
        pdfError
      );

      setError(
        "Không thể tạo file PDF."
      );
    }
  };
const handleDownloadSVG = () => {
  if (!generatedImage) {
    alert("Chưa có thiết kế để xuất SVG.");
    return;
  }

  setVectorizing(true);
  setVectorError("");

  const vectorOptions = {
    // CORELDRAW OPTIMIZED
    // Giảm số lượng path/node nhưng vẫn giữ các mảng chính.

    ltres: 1.2,
    qtres: 1.2,

    // Loại bỏ các vùng vector quá nhỏ
    pathomit: 12,

    // Lấy màu từ ảnh
    colorsampling: 2,

    // Giảm số màu để Corel không tạo quá nhiều vector
    numberofcolors: 16,

    mincolorratio: 0.02,
    colorquantcycles: 2,

    // Cải thiện các góc và đường thẳng
    rightangleenhance: true,

    // Giữ các lớp màu đơn giản
    layering: 0,

    // Không tạo stroke
    strokewidth: 0,

    linefilter: true,

    // Giảm số chữ số tọa độ
    roundcoords: 1,

    // SVG có viewBox chuẩn
    viewbox: true,

    desc: false,

    lcpr: 0,
    qcpr: 0,

    // Không làm mờ trước khi vector hóa
    blurradius: 0,

    blurdelta: 20,
  };

  try {
    ImageTracer.imageToSVG(
      generatedImage,
      (svgString) => {
        const blob = new Blob(
          [svgString],
          {
            type: "image/svg+xml;charset=utf-8",
          }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download =
          `ai-design-print-coreldraw-${Date.now()}.svg`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);

        setVectorizing(false);
      },
      vectorOptions
    );
  } catch (error) {
    console.error(error);

    setVectorError(
      "Không thể vector hóa hình ảnh."
    );

    setVectorizing(false);
  }
};
  /* =========================================================
     DOWNLOAD MENU
  ========================================================= */

  const toggleDownloadMenu = (
    event
  ) => {
    event.stopPropagation();

    if (!generatedImage) {
      return;
    }

    setDownloadOpen(
      (previous) => !previous
    );
  };

  /* =========================================================
     CANVAS
  ========================================================= */

  const numericWidth =
    Number(width) || 300;

  const numericHeight =
    Number(height) || 270;

  const canvasAspectRatio =
    numericWidth / numericHeight;

  const canvasRatioClass =
    getCanvasRatioClass();

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div
      className={
        "app " +
        (toolOn ? "" : "tool-off")
      }
    >
      <header className="topbar">
        <div className="logo-area">
          <div className="logo-mark">
            AI
          </div>

          <div>
            <div className="logo-title">
           MINH PHA DESIGN
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
              (toolOn ? "active" : "")
            }
            onClick={() =>
              setToolOn(!toolOn)
            }
          >
            <span></span>

            {toolOn ? "ON" : "OFF"}
          </button>
        </div>
      </header>

      <div className="studio">
        {/* SIDEBAR */}

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
                  className={
                    "tool-item " +
                    (designType === type
                      ? "selected"
                      : "")
                  }
                  onClick={() =>
                    setDesignType(type)
                  }
                  disabled={!toolOn}
                >
                  <span className="tool-number">
                    {String(
                      index + 1
                    ).padStart(2, "0")}
                  </span>

                  <span>{type}</span>
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
              accept="image/jpeg,image/png,image/webp,image/jpg"
              onChange={handleUpload}
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
                JPG / PNG / WEBP
              </small>
            </span>
          </label>

          {uploadedImage && (
            <div className="asset-preview">
              <img
                src={uploadedImage}
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

        {/* CANVAS */}

        <main className="canvas-area">
          <div className="canvas-toolbar">
            <div className="canvas-title">
              <span>CANVAS</span>

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
              className={
                "design-canvas " +
                canvasRatioClass
              }
              style={{
                aspectRatio:
                  canvasAspectRatio,
              }}
            >
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
                  ref={downloadMenuRef}
                >
                  <img
                    src={generatedImage}
                    className="canvas-image generated-canvas-image"
                    alt="AI generated design"
                  />

                  <div
                    className={
                      "canvas-download-menu " +
                      (downloadOpen
                        ? "open"
                        : "")
                    }
                  >
                    <button
                      className="canvas-download-trigger"
                      title="Tải xuống"
                      onClick={
                        toggleDownloadMenu
                      }
                      aria-label="Tải xuống"
                      aria-expanded={
                        downloadOpen
                      }
                    >
                      ↓
                    </button>

                    {downloadOpen && (
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
                    )}
                  </div>
                </div>
              ) : uploadedImage ? (
                <div className="generated-result">
                  <img
                    src={uploadedImage}
                    className="canvas-image generated-canvas-image"
                    alt="Reference design"
                  />
                </div>
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
                    {width || "300"} ×{" "}
                    {height || "270"}{" "}
                    {unit}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* AI EDIT */}

          <div className="edit-design-panel">
            <div className="edit-design-label">
              <span>AI EDIT</span>

              <small>
                CHỈNH SỬA THIẾT KẾ
              </small>
            </div>

            <textarea
              className="edit-design-input"
              placeholder={
                generatedImage
                  ? "Nhập yêu cầu chỉnh sửa thiết kế..."
                  : "Tạo thiết kế trước để có thể chỉnh sửa..."
              }
              rows="2"
              value={editPrompt}
              onChange={(event) =>
                setEditPrompt(
                  event.target.value
                )
              }
              disabled={
                !toolOn ||
                !generatedImage
              }
            />

            <button
              className="edit-design-button"
              onClick={handleEdit}
              disabled={
                !toolOn ||
                !generatedImage ||
                !editPrompt.trim() ||
                generating
              }
            >
              {generating
                ? "ĐANG XỬ LÝ..."
                : "✦ CHỈNH SỬA"}
            </button>
          </div>

          {/* CANVAS BOTTOM */}

          <div className="canvas-bottom">
            <div>
              <span>DOCUMENT</span>

              <strong>
                {width || "--"} ×{" "}
                {height || "--"}{" "}
                {unit}
              </strong>
            </div>

            <div>
              <span>TYPE</span>

              <strong>
                {designType}
              </strong>
            </div>

            <div>
              <span>STATUS</span>

              <strong className="ready">
                {generating
                  ? "PROCESSING"
                  : "READY"}
              </strong>
            </div>
          </div>
        </main>

        {/* PROPERTIES */}

        <aside className="properties">
          <div className="properties-header">
            <div>
              <span>AI DESIGN</span>

              <h2>
                Properties
              </h2>
            </div>

            <div className="properties-icon">
              ✦
            </div>
          </div>

          <section className="property-section">
            <div className="property-heading">
              <span>01</span>

              <strong>
                Canvas Size
              </strong>
            </div>

            <div className="size-inputs">
              <label>
                <span>W</span>

                <input
                  type="number"
                  value={width}
                  onChange={(event) =>
                    setWidth(
                      event.target.value
                    )
                  }
                  disabled={!toolOn}
                />
              </label>

              <span className="multiply">
                ×
              </span>

              <label>
                <span>H</span>

                <input
                  type="number"
                  value={height}
                  onChange={(event) =>
                    setHeight(
                      event.target.value
                    )
                  }
                  disabled={!toolOn}
                />
              </label>

              <select
                value={unit}
                onChange={(event) =>
                  setUnit(
                    event.target.value
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

          <section className="property-section">
            <div className="property-heading">
              <span>02</span>

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
              onChange={(event) =>
                setPrompt(
                  event.target.value
                )
              }
              disabled={!toolOn}
            />
          </section>

          <section className="property-section">
            <div className="property-heading">
              <span>03</span>

              <strong>
                Visual Style
              </strong>
            </div>

            <div className="style-grid">
              {styles.map((item) => (
                <button
                  key={item}
                  className={
                    style === item
                      ? "style active"
                      : "style"
                  }
                  onClick={() =>
                    setStyle(item)
                  }
                  disabled={!toolOn}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>

          <button
            className="generate-button"
            onClick={handleCreate}
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

          <section className="export-section">
            <div className="property-heading">
              <span>04</span>

              <strong>
                Export
              </strong>
            </div>

            <div className="export-grid">
              <button
                disabled={!generatedImage}
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
                disabled={!generatedImage}
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

              <button
  onClick={handleDownloadSVG}
>
  <strong>
    {vectorizing ? "..." : "SVG"}
  </strong>

  <small>
    {vectorizing ? "VECTORING" : "VECTOR"}
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
                 {/* =========================================================
             AI KÍCH NÉT ẢNH
          ========================================================= */}

          <section
            style={{
              marginTop: "18px",
              padding: "14px",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: "14px",
              background: "rgba(255,255,255,0.035)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: "800",
                    letterSpacing: "0.5px",
                  }}
                >
                  AI KÍCH NÉT ẢNH
                </div>

                <div
                  style={{
                    marginTop: "3px",
                    fontSize: "10px",
                    opacity: 0.55,
                  }}
                >
                  Tăng độ phân giải • Phục hồi chi tiết • In ấn
                </div>
              </div>

              <div
                style={{
                  padding: "4px 7px",
                  borderRadius: "6px",
                  fontSize: "9px",
                  fontWeight: "800",
                  background: "rgba(80,220,150,0.12)",
                  color: "#6ff0aa",
                }}
              >
                AI
              </div>
            </div>

            {/* CHỌN ẢNH */}

            <label
              style={{
                display: "block",
                padding: "11px",
                border: "1px dashed rgba(255,255,255,0.18)",
                borderRadius: "10px",
                textAlign: "center",
                cursor: "pointer",
                fontSize: "11px",
                background: "rgba(255,255,255,0.025)",
              }}
            >
              {upscaleImage
                ? "✓ Đã chọn ảnh"
                : "＋ Chọn ảnh cần kích nét"}

              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleUpscaleUpload}
                style={{ display: "none" }}
              />
            </label>

            {/* ẢNH GỐC */}

            {upscaleImage && (
              <div
                style={{
                  marginTop: "10px",
                  borderRadius: "10px",
                  overflow: "hidden",
                  background: "#111",
                }}
              >
                <img
                  src={upscaleImage}
                  alt="Ảnh cần kích nét"
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: "150px",
                    objectFit: "contain",
                  }}
                />
              </div>
            )}

            {/* MỨC ĐỘ KÍCH NÉT */}

            <div style={{ marginTop: "12px" }}>
              <div
                style={{
                  fontSize: "10px",
                  opacity: 0.6,
                  marginBottom: "7px",
                }}
              >
                MỨC ĐỘ KÍCH NÉT
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "6px",
                }}
              >
                {[2, 4, 8].map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    onClick={() => {
                      setUpscaleScale(scale);
                      setUpscaleMode("standard");
                    }}
                    style={{
                      padding: "8px 4px",
                      borderRadius: "7px",
                      border:
                        upscaleScale === scale &&
                        upscaleMode === "standard"
                          ? "1px solid rgba(120,180,255,0.8)"
                          : "1px solid rgba(255,255,255,0.10)",
                      background:
                        upscaleScale === scale &&
                        upscaleMode === "standard"
                          ? "rgba(80,140,255,0.16)"
                          : "rgba(255,255,255,0.035)",
                      color: "inherit",
                      fontSize: "10px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    {scale}×
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setUpscaleScale(4);
                    setUpscaleMode("print");
                  }}
                  style={{
                    padding: "8px 4px",
                    borderRadius: "7px",
                    border:
                      upscaleMode === "print"
                        ? "1px solid rgba(120,180,255,0.8)"
                        : "1px solid rgba(255,255,255,0.10)",
                    background:
                      upscaleMode === "print"
                        ? "rgba(80,140,255,0.16)"
                        : "rgba(255,255,255,0.035)",
                    color: "inherit",
                    fontSize: "9px",
                    fontWeight: "800",
                    cursor: "pointer",
                  }}
                >
                  PRINT HD
                </button>
              </div>
            </div>

            {/* CHẾ ĐỘ */}

            <div
              style={{
                marginTop: "10px",
                display: "flex",
                gap: "6px",
              }}
            >
              <button
                type="button"
                onClick={() => setUpscaleMode("standard")}
                style={{
                  flex: 1,
                  padding: "7px",
                  borderRadius: "7px",
                  border:
                    upscaleMode === "standard"
                      ? "1px solid rgba(255,255,255,0.28)"
                      : "1px solid rgba(255,255,255,0.08)",
                  background:
                    upscaleMode === "standard"
                      ? "rgba(255,255,255,0.08)"
                      : "transparent",
                  color: "inherit",
                  fontSize: "9px",
                  cursor: "pointer",
                }}
              >
                STANDARD
              </button>

              <button
                type="button"
                onClick={() => setUpscaleMode("print")}
                style={{
                  flex: 1,
                  padding: "7px",
                  borderRadius: "7px",
                  border:
                    upscaleMode === "print"
                      ? "1px solid rgba(255,255,255,0.28)"
                      : "1px solid rgba(255,255,255,0.08)",
                  background:
                    upscaleMode === "print"
                      ? "rgba(255,255,255,0.08)"
                      : "transparent",
                  color: "inherit",
                  fontSize: "9px",
                  cursor: "pointer",
                }}
              >
                PRINT
              </button>
            </div>

            {/* NÚT KÍCH NÉT */}

            <button
              type="button"
              disabled={!upscaleImage || upscaling || !toolOn}
              onClick={handleUpscale}
              style={{
                width: "100%",
                marginTop: "12px",
                padding: "11px",
                border: "none",
                borderRadius: "9px",
                background:
                  !upscaleImage || upscaling || !toolOn
                    ? "rgba(255,255,255,0.08)"
                    : "linear-gradient(135deg, #7c5cff, #4f8cff)",
                color: "#fff",
                fontSize: "11px",
                fontWeight: "800",
                letterSpacing: "0.4px",
                cursor:
                  !upscaleImage || upscaling || !toolOn
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {upscaling
                ? "AI ĐANG KÍCH NÉT..."
                : "✨ KÍCH NÉT ẢNH"}
            </button>

            {/* LỖI */}

            {upscaleError && (
              <div
                style={{
                  marginTop: "9px",
                  padding: "8px",
                  borderRadius: "7px",
                  background: "rgba(255,70,70,0.10)",
                  fontSize: "10px",
                  lineHeight: 1.4,
                }}
              >
                {upscaleError}
              </div>
            )}

            {/* THÔNG TIN KẾT QUẢ */}

            {upscaleInfo && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "9px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.04)",
                  fontSize: "9px",
                  lineHeight: 1.6,
                }}
              >
                <div>
                  Gốc:{" "}
                  <strong>
                    {upscaleInfo.originalWidth} ×{" "}
                    {upscaleInfo.originalHeight}px
                  </strong>
                </div>

                <div>
                  Sau kích nét:{" "}
                  <strong>
                    {upscaleInfo.outputWidth} ×{" "}
                    {upscaleInfo.outputHeight}px
                  </strong>
                </div>

                <div>
                  Mức:{" "}
                  <strong>
                    {upscaleInfo.scale}×
                  </strong>
                </div>
              </div>
            )}

            {/* KẾT QUẢ */}

            {upscaleResult && (
              <>
                <div
                  style={{
                    marginTop: "10px",
                    borderRadius: "10px",
                    overflow: "hidden",
                    background: "#111",
                  }}
                >
                  <img
                    src={upscaleResult}
                    alt="Ảnh sau khi kích nét"
                    style={{
                      display: "block",
                      width: "100%",
                      maxHeight: "170px",
                      objectFit: "contain",
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDownloadUpscale}
                  style={{
                    width: "100%",
                    marginTop: "9px",
                    padding: "9px",
                    borderRadius: "8px",
                    border:
                      "1px solid rgba(255,255,255,0.14)",
                    background:
                      "rgba(255,255,255,0.06)",
                    color: "inherit",
                    fontSize: "10px",
                    fontWeight: "800",
                    cursor: "pointer",
                  }}
                >
                  ↓ TẢI ẢNH ĐÃ KÍCH NÉT
                </button>
              </>
            )}
          </section>
        </aside>
         </div>

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

/* =========================================================
   SAFE REACT MOUNT
========================================================= */

const rootElement =
  document.getElementById("root");

if (rootElement) {
  const root =
    createRoot(rootElement);

  root.render(<App />);
}
