import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================================
   TÍNH TỶ LỆ
========================================= */

function getRatio(width, height) {
  const w = Number(width);
  const h = Number(height);

  if (
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w <= 0 ||
    h <= 0
  ) {
    throw new Error("Kích thước không hợp lệ.");
  }

  return w / h;
}

/* =========================================
   PHÂN LOẠI BỐ CỤC
========================================= */

function classifyLayout(ratio) {
  if (ratio > 3) return "EXTREME_WIDE";
  if (ratio >= 2.5) return "WIDE";
  if (ratio < 1 / 3) return "EXTREME_TALL";
  if (ratio <= 0.7) return "TALL";

  return "STANDARD";
}

/* =========================================
   KÍCH THƯỚC AI
=========================================

GPT-Image-2 không nhận tỷ lệ > 3:1.

Vì vậy:

400 × 70 = 5.714:1

không Generate trực tiếp.

Ta Generate bản trung gian 3:1:

1536 × 512

Sau đó edit.js sẽ mở rộng nền lên
tỷ lệ thật.
========================================= */

function getOutputSize(ratio) {
  const BASE = 1536;
  const MAX_RATIO = 3;

  let width;
  let height;

  if (ratio > MAX_RATIO) {
    width = BASE;
    height = Math.round(BASE / MAX_RATIO);
  } else if (ratio < 1 / MAX_RATIO) {
    height = BASE;
    width = Math.round(BASE / MAX_RATIO);
  } else if (ratio >= 1) {
    width = BASE;
    height = Math.round(BASE / ratio);
  } else {
    height = BASE;
    width = Math.round(BASE * ratio);
  }

  width = Math.max(
    16,
    Math.round(width / 16) * 16
  );

  height = Math.max(
    16,
    Math.round(height / 16) * 16
  );

  return `${width}x${height}`;
}

/* =========================================
   HƯỚNG DẪN BỐ CỤC
========================================= */

function buildLayoutInstruction(layout, ratio) {
  const ratioText = ratio.toFixed(4);

  if (layout === "EXTREME_WIDE") {
    return `
ĐÂY LÀ MỘT THIẾT KẾ QUẢNG CÁO PANORAMA CỰC RỘNG.

TỶ LỆ THIẾT KẾ CUỐI CÙNG:
${ratioText}:1

Hãy tư duy như một ART DIRECTOR thiết kế
backdrop hoặc biển quảng cáo thực tế.

Tạo MỘT KHÔNG GIAN LIÊN TỤC.

Không tạo ba poster ghép lại.
Không tạo triptych.
Không tạo ba panel.
Không chia thiết kế thành ba mảng riêng biệt.

Bố cục phải có sự liên kết tự nhiên
từ trái sang phải.

Phân bổ:
- nội dung chính
- nội dung phụ
- hình ảnh
- nhân vật
- sản phẩm
- trang trí

một cách cân bằng trên toàn bộ không gian.

Không dồn tất cả vào chính giữa.

Không để hai đầu thiết kế trống vô lý.

Background phải có khả năng tiếp tục tự nhiên
sang hai bên.

Nếu cần mở rộng diện tích,
chỉ mở rộng background và môi trường.

KHÔNG kéo dài:
- người
- khuôn mặt
- sản phẩm
- logo
- vật thể
- chữ

KHÔNG nhân đôi:
- người
- sản phẩm
- logo
- vật thể

Tất cả phải thuộc cùng một không gian thiết kế.
`;
  }

  if (layout === "WIDE") {
    return `
ĐÂY LÀ THIẾT KẾ QUẢNG CÁO NGANG RỘNG.

TỶ LỆ:
${ratioText}:1

Tạo một bố cục duy nhất và liên tục.

Phân bổ nội dung từ trái sang phải cân bằng.

Không dồn mọi thứ vào giữa.

Không chia thành ba panel.

Không nhân đôi đối tượng.

Không làm méo người, sản phẩm hoặc logo.

Background phải liên tục.
`;
  }

  if (
    layout === "TALL" ||
    layout === "EXTREME_TALL"
  ) {
    return `
ĐÂY LÀ THIẾT KẾ QUẢNG CÁO DỌC.

TỶ LỆ:
${ratioText}:1

Tận dụng chiều cao.

Sắp xếp nội dung theo thứ bậc rõ ràng.

Không kéo dài người.
Không bóp méo sản phẩm.
Không làm méo logo.
Không nhân đôi đối tượng.

Background phải liên tục từ trên xuống dưới.
`;
  }

  return `
ĐÂY LÀ THIẾT KẾ QUẢNG CÁO KHỔ TIÊU CHUẨN.

TỶ LỆ:
${ratioText}:1

Tạo bố cục cân bằng.

Phân cấp rõ:
- tiêu đề
- nội dung chính
- nội dung phụ
- hình ảnh
- trang trí
- background

Không dồn tất cả vào một vị trí.
`;
}

/* =========================================
   PROMPT
========================================= */

function buildPrompt({
  designType,
  width,
  height,
  unit,
  prompt,
  style,
  ratio,
  layout,
}) {
  return `
Bạn là ART DIRECTOR chuyên thiết kế:
backdrop,
biển quảng cáo,
banner,
poster,
standee
và các sản phẩm in ấn khổ lớn.

LOẠI THIẾT KẾ:
${designType}

KÍCH THƯỚC THỰC TẾ:
${width} × ${height} ${unit}

TỶ LỆ CUỐI CÙNG:
${ratio.toFixed(6)}:1

PHONG CÁCH:
${style || "Hiện đại"}

NỘI DUNG KHÁCH HÀNG:
${prompt || "Thiết kế quảng cáo chuyên nghiệp và cân bằng."}

${buildLayoutInstruction(layout, ratio)}

=================================
NGUYÊN TẮC THIẾT KẾ
=================================

Ưu tiên bố cục trước trang trí.

Nội dung chính phải nổi bật.

Nội dung phụ phải dễ đọc.

Hình ảnh phải có tỷ lệ tự nhiên.

Các thành phần phải có khoảng thở.

Background phải hỗ trợ nội dung.

Không tạo khoảng trống chết.

Không tạo bố cục lộn xộn.

Không làm méo người.

Không làm méo sản phẩm.

Không làm méo logo.

Không nhân đôi nhân vật.

Không nhân đôi sản phẩm.

Không nhân đôi logo.

Không nhân đôi vật thể.

Không tạo triptych.

Không tạo ba poster ghép lại.

Không tạo mockup.

Không tạo giao diện phần mềm.

Không watermark.

Thiết kế phải có cảm giác như
một sản phẩm quảng cáo chuyên nghiệp
được chuẩn bị để in khổ lớn.

=================================
ĐỐI VỚI PANORAMA
=================================

Nếu tỷ lệ cuối cùng rộng hơn khả năng
tạo ảnh trực tiếp của model,
hãy ưu tiên tạo một bố cục trung tâm
có background liên tục và dễ mở rộng.

Không ép nội dung vào một khung nhỏ.

Không kéo dài đối tượng.

Không làm biến dạng bố cục.

Background phải có chiều sâu,
ánh sáng và chi tiết có thể tiếp nối
tự nhiên khi mở rộng.
`;
}

/* =========================================
   API HANDLER
========================================= */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  try {
    const {
      designType = "Backdrop",
      width,
      height,
      unit = "cm",
      prompt = "",
      style = "Hiện đại",
    } = req.body || {};

    const w = Number(width);
    const h = Number(height);

    if (
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      return res.status(400).json({
        error: "Vui lòng nhập kích thước hợp lệ.",
      });
    }

    const ratio = getRatio(w, h);

    const layout = classifyLayout(ratio);

    const outputSize = getOutputSize(ratio);

    const designPrompt = buildPrompt({
      designType,
      width: w,
      height: h,
      unit,
      prompt,
      style,
      ratio,
      layout,
    });

    console.log(
      "AI DESIGN PRINT V2 GENERATE REQUEST:",
      {
        width: w,
        height: h,
        unit,
        ratio,
        layout,
        outputSize,
        designType,
        style,
      }
    );

    const response =
      await openai.images.generate({
        model: "gpt-image-2",
        prompt: designPrompt,
        size: outputSize,
        quality: "high",
      });

    const imageBase64 =
      response?.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error(
        "AI không trả về hình ảnh."
      );
    }

    const image =
      `data:image/png;base64,${imageBase64}`;

    return res.status(200).json({
      image,

      width: w,
      height: h,
      unit,

      ratio,

      layout,

      outputSize,

      needsOutpaint:
        ratio > 3 ||
        ratio < 1 / 3,

      promptVersion:
        "AI-DESIGN-PRINT-V2-GENERATE-STABLE",
    });
  } catch (error) {
    console.error(
      "AI DESIGN PRINT V2 GENERATE ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo thiết kế AI.",
    });
  }
}
