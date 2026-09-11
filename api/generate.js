import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================
   KÍCH THƯỚC & TỶ LỆ
========================= */

function getRatio(width, height) {
  const w = Number(width);
  const h = Number(height);

  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error("Kích thước không hợp lệ.");
  }

  return w / h;
}

/*
 * GPT-Image-2:
 * - Cạnh dài tối đa: 3840 px
 * - Aspect ratio tối đa: 3:1
 */
function classifyLayout(ratio) {
  if (ratio > 3) {
    return "EXTREME_WIDE";
  }

  if (ratio >= 2.5) {
    return "WIDE";
  }

  if (ratio < 1 / 3) {
    return "EXTREME_TALL";
  }

  if (ratio <= 0.7) {
    return "TALL";
  }

  return "STANDARD";
}

/*
 * Tạo kích thước mà GPT-Image-2 chấp nhận.
 *
 * Nếu tỷ lệ người dùng yêu cầu > 3:1:
 *   → không thể Generate trực tiếp
 *   → Generate ở 3:1
 *   → bước edit/outpaint sau đó sẽ mở rộng nền.
 *
 * Nếu tỷ lệ < 1:3:
 *   → tương tự cho khổ dọc cực cao.
 */
function getOutputSize(ratio) {
  const MAX_EDGE = 3840;
  const MAX_RATIO = 3;

  let width;
  let height;

  // PANORAMA CỰC RỘNG
  if (ratio > MAX_RATIO) {
    width = MAX_EDGE;
    height = Math.round(width / MAX_RATIO);
  }

  // PANORAMA CỰC DỌC
  else if (ratio < 1 / MAX_RATIO) {
    height = MAX_EDGE;
    width = Math.round(height / MAX_RATIO);
  }

  // TỶ LỆ BÌNH THƯỜNG
  else if (ratio >= 1) {
    width = MAX_EDGE;
    height = Math.round(width / ratio);
  }

  // TỶ LỆ DỌC
  else {
    height = MAX_EDGE;
    width = Math.round(height * ratio);
  }

  /*
   * GPT image size nên là bội số 16.
   */
  width = Math.max(
    16,
    Math.round(width / 16) * 16
  );

  height = Math.max(
    16,
    Math.round(height / 16) * 16
  );

  /*
   * Bảo vệ lần cuối:
   * không cạnh nào được vượt 3840.
   */
  if (width > MAX_EDGE) {
    width = MAX_EDGE;
  }

  if (height > MAX_EDGE) {
    height = MAX_EDGE;
  }

  return `${width}x${height}`;
}

/* =========================
   BỐ CỤC
========================= */

function buildLayoutInstruction({
  layout,
  ratio,
}) {
  const ratioText = ratio.toFixed(4);

  if (layout === "EXTREME_WIDE") {
    return `
ĐÂY LÀ MỘT THIẾT KẾ PANORAMA CỰC RỘNG.

TỶ LỆ THIẾT KẾ CUỐI CÙNG:
${ratioText}:1

Ảnh hiện tại chỉ là bước tạo bố cục ban đầu.
Không được cố làm biến dạng nội dung để đạt chiều rộng cực lớn.

Hãy tạo một bố cục quảng cáo ngang rộng, chuyên nghiệp và liên tục.

YÊU CẦU:

- Một không gian thiết kế duy nhất.
- Background liên tục từ trái sang phải.
- Bố cục cân bằng toàn chiều ngang.
- Không dồn tất cả nội dung vào chính giữa.
- Hai bên phải có yếu tố trang trí phù hợp.
- Nội dung chính phải nổi bật.
- Các thành phần phụ hỗ trợ nội dung chính.
- Có khoảng thở hợp lý.
- Không tạo khoảng trống chết.
- Không chia thành ba poster.
- Không tạo triptych.
- Không tạo ba panel.
- Không nhân đôi nhân vật.
- Không nhân đôi sản phẩm.
- Không nhân đôi logo.
- Không nhân đôi cùng một vật thể.
- Không kéo dài hoặc bóp méo người.
- Không kéo dài hoặc bóp méo sản phẩm.
- Không kéo dài hoặc bóp méo logo.

Hãy thiết kế như một backdrop hoặc biển quảng cáo thực tế
có thể trải dài hàng mét ngoài đời.

Nếu cần thêm không gian,
hãy để background và môi trường có khả năng tiếp tục tự nhiên
ở hai bên.

Không dùng các đường chia dọc để giả lập panorama.
`;

  }

  if (layout === "WIDE") {
    return `
ĐÂY LÀ THIẾT KẾ NGANG RỘNG.

TỶ LỆ:
${ratioText}:1

Tạo một bố cục quảng cáo duy nhất và liên tục.

Phân bổ nội dung hợp lý từ trái sang phải.
Không dồn mọi thứ vào giữa.
Không để hai bên trống bất hợp lý.

Không chia thành ba panel.
Không nhân đôi người, sản phẩm hoặc vật thể.
Không làm méo các đối tượng.

Background phải liên tục và hòa hợp với toàn bộ thiết kế.
`;
  }

  if (
    layout === "TALL" ||
    layout === "EXTREME_TALL"
  ) {
    return `
ĐÂY LÀ THIẾT KẾ DỌC.

TỶ LỆ:
${ratioText}:1

Tận dụng chiều cao của thiết kế.

Sắp xếp nội dung theo thứ bậc rõ ràng.
Tạo khoảng thở hợp lý.

Không kéo dài người.
Không kéo dài sản phẩm.
Không bóp méo logo.
Không nhân đôi đối tượng.

Background phải liên tục từ trên xuống dưới.
`;
  }

  return `
ĐÂY LÀ THIẾT KẾ KHỔ TIÊU CHUẨN.

TỶ LỆ:
${ratioText}:1

Tạo bố cục cân bằng và chuyên nghiệp.

Phân cấp rõ:
- Nội dung chính
- Nội dung phụ
- Hình ảnh
- Trang trí
- Background

Không dồn tất cả thành phần vào một vị trí.
Không tạo khoảng trống chết.
`;
}

/* =========================
   PROMPT AI
========================= */

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
  const layoutInstruction = buildLayoutInstruction({
    layout,
    ratio,
  });

  return `
Bạn là ART DIRECTOR chuyên thiết kế quảng cáo chuyên nghiệp
cho backdrop, biển quảng cáo, banner, poster, standee
và các sản phẩm in ấn khổ lớn.

HÃY TẠO THIẾT KẾ DỰA TRÊN YÊU CẦU SAU:

LOẠI THIẾT KẾ:
${designType}

KÍCH THƯỚC THỰC TẾ:
${width} × ${height} ${unit}

TỶ LỆ THỰC TẾ:
${ratio.toFixed(6)}:1

PHONG CÁCH:
${style || "Hiện đại"}

NỘI DUNG NGƯỜI DÙNG:
${prompt || "Thiết kế quảng cáo chuyên nghiệp, đẹp và cân bằng."}

${layoutInstruction}

=========================
NGUYÊN TẮC THIẾT KẾ
=========================

1. Ưu tiên bố cục đẹp trước khi trang trí.

2. Nội dung chính phải dễ nhìn và có thứ bậc rõ ràng.

3. Phân bổ các thành phần trên toàn bộ không gian.

4. Không để toàn bộ nội dung tập trung vào một điểm.

5. Không để khoảng trống lớn vô nghĩa.

6. Background phải hỗ trợ nội dung.

7. Các thành phần phải hòa vào cùng một không gian.

8. Giữ tỷ lệ tự nhiên của người, sản phẩm và vật thể.

9. Không làm biến dạng khuôn mặt.

10. Không kéo dài cơ thể.

11. Không kéo rộng sản phẩm.

12. Không bóp méo logo.

13. Không nhân đôi nhân vật.

14. Không nhân đôi sản phẩm.

15. Không nhân đôi logo.

16. Không tạo ba bản sao của cùng một đối tượng.

17. Không tạo triptych.

18. Không tạo ba poster ghép lại.

19. Không dùng các đường chia dọc để tạo cảm giác nhiều panel.

20. Không tạo mockup.

21. Không tạo khung điện thoại.

22. Không tạo giao diện phần mềm.

23. Không tạo watermark.

24. Thiết kế phải phù hợp với quảng cáo in khổ lớn.

25. Giữ vùng an toàn quanh nội dung quan trọng.

=========================
ĐỐI VỚI KHỔ RẤT RỘNG
=========================

Thiết kế phải được tư duy như một backdrop quảng cáo thực tế.

Không lấy một poster nhỏ rồi kéo dài.

Hãy xây dựng background có chiều sâu,
các chi tiết trang trí có thể tiếp nối tự nhiên,
và bố cục cân bằng từ trái sang phải.

Các khu vực trái, giữa và phải phải liên kết
thành MỘT THIẾT KẾ DUY NHẤT.

Không được có cảm giác ba hình ảnh ghép lại.

=========================
MỤC TIÊU CUỐI
=========================

Một thiết kế quảng cáo:

- đẹp
- cân bằng
- chuyên nghiệp
- dễ đọc
- có chiều sâu
- background liên tục
- bố cục rõ ràng
- phù hợp in ấn
- không méo đối tượng
- không nhân đôi đối tượng
- không chia panel
`;
}

/* =========================
   API
========================= */

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
      "AI DESIGN PRINT V2 GENERATE:",
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
        "AI-DESIGN-PRINT-V2-GENERATE",

      message:
        ratio > 3 || ratio < 1 / 3
          ? "Ảnh được tạo ở tỷ lệ tối đa 3:1 và sẽ được mở rộng nền bằng AI ở bước tiếp theo."
          : "Ảnh được tạo theo tỷ lệ yêu cầu.",
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
