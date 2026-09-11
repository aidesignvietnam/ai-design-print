import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================================
   TỶ LỆ
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
  if (ratio > 5) return "PANORAMA_EXTREME";
  if (ratio > 3) return "PANORAMA_WIDE";
  if (ratio >= 2.5) return "WIDE";
  if (ratio < 0.2) return "VERTICAL_EXTREME";
  if (ratio <= 0.7) return "TALL";

  return "STANDARD";
}

/* =========================================
   KÍCH THƯỚC GENERATE
========================================= */

function getOutputSize(ratio) {
  /*
   * GPT-Image-2 tối đa 3:1.
   *
   * Với 400 × 70:
   * ratio = 5.714
   *
   * Generate trung gian:
   * 1536 × 512
   */

  const BASE = 1536;
  const MAX_RATIO = 3;

  let width;
  let height;

  if (ratio > MAX_RATIO) {
    width = BASE;
    height = Math.round(
      BASE / MAX_RATIO
    );
  } else if (ratio < 1 / MAX_RATIO) {
    height = BASE;
    width = Math.round(
      BASE / MAX_RATIO
    );
  } else if (ratio >= 1) {
    width = BASE;
    height = Math.round(
      BASE / ratio
    );
  } else {
    height = BASE;
    width = Math.round(
      BASE * ratio
    );
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
   HƯỚNG DẪN PANORAMA
========================================= */

function buildLayoutInstruction(
  layout,
  ratio
) {
  if (
    layout === "PANORAMA_EXTREME"
  ) {
    return `
=========================================
PANORAMA EXTREME
=========================================

TỶ LỆ THIẾT KẾ CUỐI:
${ratio.toFixed(4)}:1

Đây là một thiết kế quảng cáo
PANORAMA CỰC RỘNG.

Hãy thiết kế như một backdrop
hoặc biển quảng cáo ngoài trời thực tế.

QUAN TRỌNG:

Không được gom toàn bộ nội dung
vào giữa.

Không được tạo một poster nhỏ
nằm giữa một background rất rộng.

Nội dung phải được tổ chức
theo TOÀN BỘ CHIỀU NGANG.

Hãy tư duy theo cấu trúc:

TRÁI → KHU VỰC PHỤ
GIỮA → NỘI DUNG CHÍNH
PHẢI → KHU VỰC PHỤ

Có thể sử dụng:
- hình ảnh phụ
- hoa văn
- ánh sáng
- sản phẩm
- vật thể trang trí
- cảnh quan
- gradient
- background environment

để tạo sự cân bằng hai bên.

NHƯNG:

Không nhân đôi cùng một nhân vật.

Không nhân đôi cùng một sản phẩm.

Không nhân đôi logo.

Không lặp lại chữ.

Không tạo ba bản sao của cùng một thiết kế.

Không tạo triptych.

Không tạo ba panel.

Không chia thành ba poster.

Các khu vực trái, giữa và phải
phải thuộc CÙNG MỘT KHÔNG GIAN.

Background phải liên tục.

Hãy tạo chiều sâu từ trái sang phải.

Đối tượng chính có thể nằm lệch
khỏi chính giữa một chút để bố cục
tự nhiên hơn.

Không dồn tất cả chữ vào một vùng nhỏ.

Các thành phần phải có khoảng cách
hợp lý và dễ đọc khi in khổ lớn.

=========================================
BỐ CỤC CHO BIỂN QUẢNG CÁO
=========================================

Với panorama cực rộng:

- Không để hai đầu trống.
- Không để phần giữa quá nặng.
- Không kéo dài đối tượng.
- Không làm méo người.
- Không làm méo sản phẩm.
- Không làm méo logo.
- Không kéo giãn typography.

Hai đầu nên được lấp đầy bằng
background và các yếu tố phụ
phù hợp với chủ đề.

=========================================
OUTPAINT FRIENDLY
=========================================

Bố cục phải có background liên tục
và có thể mở rộng tự nhiên.

Các vùng sát mép trái và mép phải
nên chứa background hoặc thành phần
trang trí có thể tiếp nối.

Không đặt các đối tượng quan trọng
sát mép ảnh.

Chừa SAFE MARGIN cho:
- chữ
- logo
- khuôn mặt
- sản phẩm chính

=========================================
`;
  }

  if (
    layout === "PANORAMA_WIDE"
  ) {
    return `
=========================================
PANORAMA WIDE
=========================================

Thiết kế ngang rộng.

Không gom nội dung vào chính giữa.

Phân bổ bố cục theo chiều ngang.

Tạo background liên tục.

Sử dụng không gian hai bên
một cách có chủ ý.

Không tạo triptych.

Không nhân đôi người,
sản phẩm hoặc logo.

Không kéo méo đối tượng.

Các yếu tố quan trọng phải nằm
trong vùng an toàn để in.
`;
  }

  if (
    layout === "WIDE"
  ) {
    return `
Thiết kế quảng cáo ngang rộng.

Phân bổ nội dung cân bằng
từ trái sang phải.

Không dồn toàn bộ nội dung
vào trung tâm.

Background phải liên tục.

Không tạo ba panel.

Không nhân đôi đối tượng.

Không làm méo người,
sản phẩm hoặc logo.
`;
  }

  if (
    layout === "TALL" ||
    layout === "VERTICAL_EXTREME"
  ) {
    return `
Thiết kế quảng cáo dọc.

Tận dụng toàn bộ chiều cao.

Phân bố nội dung từ trên xuống dưới.

Không dồn mọi thứ vào chính giữa.

Background phải liên tục.

Không kéo méo người,
sản phẩm hoặc logo.

Không nhân đôi đối tượng.
`;
  }

  return `
Thiết kế quảng cáo chuyên nghiệp
với bố cục cân bằng.

Phân cấp rõ ràng:
- tiêu đề
- nội dung chính
- nội dung phụ
- hình ảnh
- background

Giữ khoảng thở và safe margin.
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
Bạn là ART DIRECTOR chuyên thiết kế
quảng cáo và in ấn chuyên nghiệp.

LOẠI THIẾT KẾ:
${designType}

KÍCH THƯỚC THỰC TẾ:
${width} × ${height} ${unit}

TỶ LỆ:
${ratio.toFixed(6)}:1

PHONG CÁCH:
${style || "Hiện đại"}

NỘI DUNG KHÁCH HÀNG:
${prompt || "Thiết kế quảng cáo chuyên nghiệp."}

${buildLayoutInstruction(
  layout,
  ratio
)}

=========================================
NGUYÊN TẮC THIẾT KẾ CHUNG
=========================================

Thiết kế phải giống một sản phẩm
quảng cáo thương mại thực tế.

Ưu tiên:
1. Bố cục
2. Khả năng đọc
3. Hình ảnh
4. Không gian
5. Tính thẩm mỹ

Không làm thiết kế giống một poster
nhỏ đặt trên background lớn.

Đối với khổ cực rộng,
hãy tạo cảm giác rằng toàn bộ canvas
được thiết kế ngay từ đầu.

Các thành phần phải có quan hệ
với nhau trong cùng một không gian.

Không dùng:
- triptych
- split screen
- three panels
- three posters
- mirrored layout
- repeated subjects
- repeated products
- repeated logos

Không nhân đôi người.

Không nhân đôi sản phẩm.

Không nhân đôi logo.

Không nhân đôi chữ.

Không kéo dài người.

Không bóp méo khuôn mặt.

Không kéo giãn sản phẩm.

Không kéo giãn logo.

Không làm biến dạng typography.

Background phải liên tục.

Ánh sáng phải thống nhất.

Màu sắc phải thống nhất.

Phối cảnh phải thống nhất.

Tạo safe margin xung quanh
những thành phần quan trọng.

Thiết kế phải phù hợp cho
in quảng cáo khổ lớn.
`;
}

/* =========================================
   API HANDLER
========================================= */

export default async function handler(
  req,
  res
) {
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
        error:
          "Vui lòng nhập kích thước hợp lệ.",
      });
    }

    const ratio =
      getRatio(w, h);

    const layout =
      classifyLayout(ratio);

    const outputSize =
      getOutputSize(ratio);

    const designPrompt =
      buildPrompt({
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
      "AI DESIGN PRINT V3 GENERATE REQUEST:",
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
        "AI-DESIGN-PRINT-V3-PANORAMA",
    });
  } catch (error) {
    console.error(
      "AI DESIGN PRINT V3 GENERATE ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo thiết kế AI.",
    });
  }
}
