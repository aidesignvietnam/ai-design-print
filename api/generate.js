import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getRatio(width, height) {
  const w = Number(width);
  const h = Number(height);

  if (!w || !h || w <= 0 || h <= 0) {
    throw new Error("Kích thước không hợp lệ.");
  }

  return w / h;
}

function classifyLayout(ratio) {
  if (ratio >= 4.5) return "ULTRA_WIDE";
  if (ratio >= 2.5) return "WIDE";
  if (ratio <= 0.45) return "ULTRA_TALL";
  if (ratio <= 0.7) return "TALL";

  return "STANDARD";
}

/*
 * GPT-Image-2 cần kích thước pixel hợp lý.
 * Quan trọng: kích thước này được tính theo TỶ LỆ thật,
 * không dùng resize fill để ép méo hình.
 */
function getOutputSize(ratio) {
  const MAX = 4096;
  const MIN = 1024;

  let width;
  let height;

  if (ratio >= 1) {
    width = MAX;
    height = Math.round(width / ratio);
  } else {
    height = MAX;
    width = Math.round(height * ratio);
  }

  /*
   * Giữ kích thước trong vùng hợp lý.
   */
  if (width < MIN) {
    width = MIN;
    height = Math.round(width / ratio);
  }

  if (height < MIN) {
    height = MIN;
    width = Math.round(height * ratio);
  }

  /*
   * Làm tròn về bội số 16 để ảnh ổn định hơn.
   */
  width = Math.max(16, Math.round(width / 16) * 16);
  height = Math.max(16, Math.round(height / 16) * 16);

  return `${width}x${height}`;
}

function buildLayoutInstruction({
  designType,
  style,
  width,
  height,
  unit,
  ratio,
  layout,
}) {
  const physicalSize = `${width} × ${height} ${unit}`;

  let layoutInstruction = "";

  if (layout === "ULTRA_WIDE") {
    layoutInstruction = `
ĐÂY LÀ THIẾT KẾ PANORAMA CỰC RỘNG.

Tỷ lệ mục tiêu là ${ratio.toFixed(4)}:1.

Hãy thiết kế một BỐ CỤC QUẢNG CÁO DUY NHẤT, LIÊN TỤC trên toàn bộ chiều ngang.

Không được thiết kế như ba poster ghép lại.
Không được chia thành ba panel.
Không được lặp lại cùng một nhân vật hoặc sản phẩm ở nhiều vị trí.
Không được kéo giãn nhân vật, sản phẩm, logo hoặc vật thể.

Phân bổ hình ảnh, nội dung và trang trí cân bằng từ trái sang phải.

Không để phần giữa quá nặng trong khi hai bên trống.
Không để hai đầu thiết kế bị bỏ trống vô lý.

Các chi tiết nền phải liên tục và hòa vào cùng một không gian.
Nếu cần thêm diện tích, hãy mở rộng KHÔNG GIAN VÀ NỀN một cách tự nhiên.

Ưu tiên:
- bố cục ngang chuyên nghiệp
- chiều sâu
- khoảng thở
- cân bằng thị giác
- điểm nhấn rõ ràng
- nền liên tục
- các thành phần hòa vào cùng một thiết kế
`;
  } else if (layout === "WIDE") {
    layoutInstruction = `
ĐÂY LÀ THIẾT KẾ NGANG RỘNG.

Tỷ lệ mục tiêu là ${ratio.toFixed(4)}:1.

Bố cục phải trải đều theo chiều ngang.
Không dồn toàn bộ nội dung vào trung tâm.
Hai bên phải có các yếu tố hỗ trợ phù hợp nhưng không được gây rối.

Tạo một không gian thiết kế liên tục, cân bằng và chuyên nghiệp.
Không nhân đôi đối tượng.
Không chia thành các panel riêng biệt.
`;
  } else if (layout === "TALL" || layout === "ULTRA_TALL") {
    layoutInstruction = `
ĐÂY LÀ THIẾT KẾ DỌC.

Tỷ lệ mục tiêu là ${ratio.toFixed(4)}:1.

Bố cục phải tận dụng chiều cao.
Các thành phần được sắp xếp theo chiều dọc có thứ bậc rõ ràng.

Không kéo giãn người, sản phẩm hoặc vật thể.
Không nhân đôi đối tượng.
Không để khoảng trống chết quá lớn.
`;
  } else {
    layoutInstruction = `
ĐÂY LÀ THIẾT KẾ KHỔ TIÊU CHUẨN.

Tỷ lệ mục tiêu là ${ratio.toFixed(4)}:1.

Tạo bố cục cân bằng, chuyên nghiệp và dễ đọc.
Có phân cấp rõ ràng giữa nội dung chính, nội dung phụ và hình ảnh.
Không dồn tất cả thành phần vào một điểm.
`;
  }

  return `
KÍCH THƯỚC THIẾT KẾ:
${physicalSize}

TỶ LỆ HÌNH ẢNH MỤC TIÊU:
${ratio.toFixed(6)}:1

LOẠI THIẾT KẾ:
${designType}

PHONG CÁCH:
${style || "Hiện đại"}

${layoutInstruction}

QUY TẮC CHUNG:

1. Giữ đúng tỷ lệ của mọi người, sản phẩm, logo và vật thể.
2. Không bóp méo hoặc kéo dài đối tượng.
3. Không nhân đôi đối tượng.
4. Không tạo bố cục triptych.
5. Không tạo ba khu vực như ba ảnh ghép.
6. Tạo một background liên tục.
7. Nội dung phải có khoảng thở.
8. Phân bổ thị giác cân bằng toàn bộ khổ.
9. Nội dung quan trọng nằm trong vùng an toàn, không sát mép.
10. Hình ảnh và nền phải hòa vào cùng một không gian.
11. Không tạo khoảng trống vô nghĩa.
12. Không làm mất cân bằng trái/phải.
13. Không làm mất cân bằng trên/dưới.
14. Thiết kế phải có cảm giác là một sản phẩm quảng cáo chuyên nghiệp để in khổ lớn.
`;
}

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
    designType,
    style,
    width,
    height,
    unit,
    ratio,
    layout,
  });

  return `
Bạn là một ART DIRECTOR chuyên thiết kế quảng cáo khổ lớn,
backdrop, biển quảng cáo, banner, poster, standee và các sản phẩm in ấn chuyên nghiệp.

NHIỆM VỤ:

Tạo một thiết kế hoàn chỉnh dựa trên yêu cầu của người dùng.

YÊU CẦU CỦA NGƯỜI DÙNG:
${prompt || "Thiết kế quảng cáo chuyên nghiệp, bố cục đẹp và cân bằng."}

${layoutInstruction}

ƯU TIÊN THIẾT KẾ:

- Bố cục đẹp ngay từ đầu.
- Nội dung chính dễ nhìn.
- Tiêu đề có thứ bậc rõ ràng.
- Hình ảnh và chữ có khoảng thở.
- Các thành phần được phân bố hợp lý trên toàn bộ nền.
- Nền phải hỗ trợ nội dung thay vì cạnh tranh với nội dung.
- Màu sắc hài hòa.
- Ánh sáng và chiều sâu tự nhiên.
- Phù hợp với in ấn quảng cáo khổ lớn.

ĐẶC BIỆT:

Nếu thiết kế rất rộng, hãy suy nghĩ như một backdrop thực tế
được thiết kế cho một sân khấu hoặc không gian quảng cáo dài.

Không cố nhét một poster thông thường vào một khổ panorama.

Không kéo giãn một thiết kế nhỏ thành một thiết kế dài.

Hãy tạo bố cục phù hợp với tỷ lệ ngay từ đầu.

KẾT QUẢ MONG MUỐN:

Một thiết kế quảng cáo duy nhất,
liên tục,
cân bằng,
chuyên nghiệp,
phù hợp để in khổ lớn.

Không có watermark.
Không có mockup.
Không có khung điện thoại.
Không có giao diện phần mềm.
Chỉ tạo chính thiết kế được yêu cầu.
`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
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

    if (!w || !h || w <= 0 || h <= 0) {
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

    console.log("AI DESIGN PRINT V2 REQUEST:", {
      width: w,
      height: h,
      unit,
      ratio,
      layout,
      outputSize,
      designType,
      style,
    });

    const response = await openai.images.generate({
      model: "gpt-image-2",
      prompt: designPrompt,
      size: outputSize,
      quality: "high",
    });

    const imageBase64 = response?.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error("AI không trả về hình ảnh.");
    }

    const image = `data:image/png;base64,${imageBase64}`;

    return res.status(200).json({
      image,
      width: w,
      height: h,
      unit,
      ratio,
      layout,
      outputSize,
      promptVersion: "AI-DESIGN-PRINT-V2-LAYOUT",
    });
  } catch (error) {
    console.error("AI DESIGN PRINT GENERATE ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo thiết kế AI.",
    });
  }
}
