import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const {
      designType,
      width,
      height,
      unit,
      prompt,
      style,
      uploadedImage,
    } = req.body || {};

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        error: "Vui lòng nhập nội dung thiết kế.",
      });
    }

    const w = Number(width);
    const h = Number(height);

    if (!w || !h || w <= 0 || h <= 0) {
      return res.status(400).json({
        error: "Kích thước thiết kế không hợp lệ.",
      });
    }

    const ratio = w / h;

    const systemPrompt = `
Bạn là AI ART DIRECTOR chuyên thiết kế quảng cáo chuyên nghiệp cho in ấn khổ lớn.

Nhiệm vụ của bạn KHÔNG phải là tạo ảnh ngay.

Nhiệm vụ của bạn là đọc yêu cầu của khách hàng và lập một DESIGN PLAN chi tiết để một AI tạo ảnh có thể thực hiện đúng.

Bạn phải suy nghĩ như một designer quảng cáo chuyên nghiệp, không được sử dụng một template cố định.

NGUYÊN TẮC QUAN TRỌNG:

1. TỰ HIỂU Ý ĐỒ KHÁCH HÀNG
- Xác định mục tiêu của thiết kế.
- Xác định thông tin quan trọng nhất.
- Xác định thông tin phụ.
- Xác định đối tượng khách hàng.
- Xác định điểm cần thu hút sự chú ý đầu tiên.

2. TỰ PHÂN CẤP NỘI DUNG
Phân loại:
- HEADLINE
- SUBHEADLINE
- OFFER / PROMOTION
- SUPPORTING TEXT
- CONTACT
- LOGO
- VISUAL SUBJECT

Nếu khách hàng nói "chữ thật to", "chữ nổi bật", "dễ nhìn từ xa", "chữ rõ", phải ưu tiên kích thước và độ tương phản của chữ.

3. KHÔNG ĐƯỢC ÉP MỘT BỐ CỤC
Không mặc định:
- chữ ở giữa
- hình hai bên
- bố cục 3 phần
- poster nhỏ nằm giữa canvas

Hãy TỰ CHỌN bố cục phù hợp nhất.

Có thể sử dụng:
- left text / right visual
- right text / left visual
- hero text dominant
- hero visual dominant
- asymmetric composition
- diagonal composition
- centered composition
- full-width typography
- layered composition
- editorial composition
- luxury minimal composition
- dynamic promotional composition

Chỉ chọn bố cục phù hợp với nội dung.

4. KÍCH THƯỚC PHẢI ẢNH HƯỞNG ĐẾN BỐ CỤC

Tỷ lệ hiện tại: ${ratio.toFixed(3)}

Nếu là panorama rất rộng:
- Không thu nhỏ toàn bộ nội dung thành một cụm nhỏ.
- Phải tận dụng chiều ngang.
- Có thể dùng typography lớn, hình ảnh trải rộng, visual dẫn mắt hoặc bố cục bất đối xứng.
- Không tạo cảm giác hai đầu là khoảng trống vô nghĩa.

Nếu là thiết kế dọc:
- Tận dụng chiều cao.
- Tạo hierarchy theo chiều dọc.

Nếu gần vuông:
- Có thể sử dụng bố cục cân bằng hoặc trung tâm.

5. PHONG CÁCH
Phải tự diễn giải phong cách:
- Hiện đại
- Sang trọng
- Tối giản
- Thiếu nhi
- Khai giảng
- Sự kiện
- hoặc phong cách do khách hàng yêu cầu.

Không chỉ ghi lại tên phong cách.
Hãy mô tả:
- màu sắc
- chất liệu thị giác
- ánh sáng
- typography
- hình ảnh
- cảm xúc
- độ tương phản
- mức độ cao cấp

6. HÌNH ẢNH
Nếu cần người:
- khuôn mặt tự nhiên
- tỷ lệ cơ thể chính xác
- tư thế tự nhiên
- không biến dạng
- không lặp người

Nếu cần sản phẩm:
- sản phẩm rõ nét
- đúng hình dáng
- không méo
- không nhân đôi
- không tạo sản phẩm giả không liên quan.

7. CHẤT LƯỢNG
Thiết kế phải hướng đến:
- quảng cáo chuyên nghiệp
- hình ảnh sắc nét
- ánh sáng đẹp
- màu sắc hài hòa
- độ tương phản tốt
- hierarchy rõ ràng
- dễ đọc từ xa
- phù hợp in ấn khổ lớn.

8. KHOẢNG TRỐNG
Khoảng trống phải có chủ đích.
Không để vùng trống lớn chỉ vì AI không biết sử dụng canvas.

9. SỰ SÁNG TẠO
Không lặp lại một bố cục chỉ vì đó là bố cục trước đó.
Hãy chọn giải pháp trực quan tốt nhất cho từng yêu cầu.

10. AN TOÀN CHO IN ẤN
Để nội dung quan trọng tránh sát mép.
Có safe margin hợp lý.
Không đặt chữ quan trọng vào vùng dễ bị cắt.

11. TEXT
Không tự thay đổi nội dung khách hàng cung cấp.
Không thêm thông tin kinh doanh giả.
Không tự thêm số điện thoại, địa chỉ hoặc thương hiệu không được yêu cầu.

Hãy trả về JSON hợp lệ duy nhất.
Không markdown.
Không giải thích bên ngoài JSON.
`;

    const userPrompt = `
THÔNG TIN THIẾT KẾ:

Loại thiết kế:
${designType || "Không xác định"}

Kích thước:
${w} × ${h} ${unit || "cm"}

Tỷ lệ:
${ratio.toFixed(3)}

Phong cách khách hàng yêu cầu:
${style || "Tự lựa chọn phù hợp"}

Nội dung / yêu cầu:
${prompt}

${uploadedImage ? "Khách hàng có cung cấp hình ảnh tham khảo hoặc hình ảnh đầu vào." : "Không có hình ảnh đầu vào."}

Hãy phân tích toàn bộ yêu cầu và tạo DESIGN PLAN tốt nhất.
`;

    const response = await openai.responses.create({
      model: "gpt-5.4",
      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "design_plan",
          strict: true,
          schema: {
            type: "object",
            properties: {
              concept: {
                type: "string",
              },
              targetAudience: {
                type: "string",
              },
              visualPriority: {
                type: "array",
                items: {
                  type: "string",
                },
              },
              headline: {
                type: "string",
              },
              supportingText: {
                type: "array",
                items: {
                  type: "string",
                },
              },
              layoutType: {
                type: "string",
              },
              layoutDescription: {
                type: "string",
              },
              textPlacement: {
                type: "string",
              },
              visualPlacement: {
                type: "string",
              },
              textScale: {
                type: "string",
              },
              colorDirection: {
                type: "string",
              },
              typographyDirection: {
                type: "string",
              },
              backgroundDirection: {
                type: "string",
              },
              lightingDirection: {
                type: "string",
              },
              imageQuality: {
                type: "string",
              },
              compositionDirection: {
                type: "string",
              },
              printSafety: {
                type: "string",
              },
              creativityDirection: {
                type: "string",
              },
              negativePrompt: {
                type: "string",
              },
            },
            required: [
              "concept",
              "targetAudience",
              "visualPriority",
              "headline",
              "supportingText",
              "layoutType",
              "layoutDescription",
              "textPlacement",
              "visualPlacement",
              "textScale",
              "colorDirection",
              "typographyDirection",
              "backgroundDirection",
              "lightingDirection",
              "imageQuality",
              "compositionDirection",
              "printSafety",
              "creativityDirection",
              "negativePrompt",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const outputText = response.output_text;

    if (!outputText) {
      throw new Error("AI không trả về Design Plan.");
    }

    let designPlan;

    try {
      designPlan = JSON.parse(outputText);
    } catch (parseError) {
      console.error("Design Plan JSON parse error:", parseError);
      console.error("Raw output:", outputText);

      throw new Error("Không đọc được Design Plan từ AI.");
    }

    return res.status(200).json({
      success: true,
      designPlan,
      meta: {
        designType,
        width: w,
        height: h,
        unit,
        ratio,
        style,
      },
    });
  } catch (error) {
    console.error("AI ART DIRECTOR ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo Design Plan.",
    });
  }
}
