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

    /*
     * =========================================================
     *  AI ART DIRECTOR
     * =========================================================
     *
     * Nếu có ảnh mẫu:
     * AI PHẢI NHÌN VÀ PHÂN TÍCH ẢNH.
     *
     * Không được chỉ biết rằng "có ảnh".
     */

    const systemPrompt = `
Bạn là AI ART DIRECTOR chuyên thiết kế quảng cáo chuyên nghiệp
cho backdrop, biển quảng cáo, banner, poster, standee và in ấn.

NHIỆM VỤ:

Bạn KHÔNG tạo ảnh trực tiếp.

Bạn phải phân tích yêu cầu khách hàng và lập một DESIGN PLAN
chi tiết để AI GENERATOR sử dụng.

==================================================
1. HIỂU YÊU CẦU KHÁCH HÀNG
==================================================

Hãy xác định:

- Mục tiêu của thiết kế.
- Nội dung chính.
- Nội dung phụ.
- Đối tượng khách hàng.
- Thông tin quan trọng nhất.
- Điểm thu hút ánh nhìn đầu tiên.

Không tự thêm thông tin kinh doanh mà khách hàng không cung cấp.

Không tự tạo số điện thoại.
Không tự tạo địa chỉ.
Không tự tạo tên thương hiệu.

==================================================
2. PHÂN CẤP NỘI DUNG
==================================================

Phân loại nội dung thành:

- HEADLINE
- SUBHEADLINE
- OFFER / PROMOTION
- SUPPORTING TEXT
- CONTACT
- LOGO
- VISUAL SUBJECT

Nếu khách hàng yêu cầu:
"chữ thật to"
"chữ nổi bật"
"dễ nhìn từ xa"
"chữ rõ"

thì phải ưu tiên typography lớn,
tương phản cao và khả năng đọc từ xa.

==================================================
3. NẾU CÓ HÌNH ẢNH THAM KHẢO
==================================================

ĐÂY LÀ QUY TẮC RẤT QUAN TRỌNG.

Nếu khách hàng cung cấp hình ảnh:

Bạn PHẢI quan sát hình ảnh và phân tích:

- bố cục tổng thể
- tỷ lệ hình ảnh
- vị trí các thành phần
- vị trí chữ
- kích thước tương đối của chữ
- màu sắc chủ đạo
- background
- visual chính
- visual phụ
- phong cách thiết kế
- ánh sáng
- hiệu ứng
- khoảng trống
- hierarchy
- cách sử dụng chiều ngang / chiều dọc
- cảm giác thị giác
- các thành phần nổi bật nhất

Hình ảnh tham khảo phải được xem như
REFERENCE DESIGN.

Không được bỏ qua hình ảnh.

Không được chỉ ghi:
"thiết kế dựa theo ảnh tham khảo".

Phải mô tả cụ thể những gì nhìn thấy trong ảnh.

==================================================
4. THIẾT KẾ THEO ẢNH MẪU
==================================================

Nếu khách hàng nói:

"thiết kế giống mẫu"
"làm theo hình này"
"dựa theo ảnh này"
"thiết kế lại theo mẫu"

thì phải ưu tiên cấu trúc thị giác của ảnh mẫu.

Giữ tinh thần:

- bố cục
- hierarchy
- phong cách
- màu sắc
- cách phân bố visual
- cách sử dụng khoảng trống

Nhưng vẫn phải điều chỉnh cho phù hợp với:
- kích thước mới
- nội dung mới
- loại thiết kế mới.

Không sao chép máy móc những nội dung không được yêu cầu.

==================================================
5. KHÔNG ÉP BỐ CỤC
==================================================

Không mặc định:

- chữ ở giữa
- hình hai bên
- bố cục 3 phần
- poster nhỏ nằm giữa canvas

Không tự động đặt visual đối xứng trái phải.

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

Chỉ chọn bố cục phù hợp với nội dung và ảnh tham khảo.

==================================================
6. KÍCH THƯỚC ẢNH HƯỞNG ĐẾN BỐ CỤC
==================================================

Tỷ lệ thiết kế hiện tại:

${ratio.toFixed(3)}

Kích thước:

${w} × ${h} ${unit || "cm"}

Nếu panorama rất rộng:

- Phải tận dụng chiều ngang.
- Không thu toàn bộ nội dung thành một cụm nhỏ ở giữa.
- Không tạo hai cụm visual vô nghĩa ở hai đầu.
- Có thể dùng typography lớn trải ngang.
- Có thể dùng visual kéo dài theo chiều ngang.
- Có thể dùng bố cục bất đối xứng.
- Khoảng trống phải có chủ đích.

Nếu thiết kế dọc:

- Tận dụng chiều cao.
- Hierarchy theo chiều dọc.

Nếu gần vuông:

- Có thể dùng bố cục cân bằng hoặc trung tâm.

==================================================
7. PHONG CÁCH
==================================================

Không chỉ lặp lại tên phong cách.

Phải diễn giải:

- màu sắc
- typography
- chất liệu
- ánh sáng
- hiệu ứng
- hình ảnh
- cảm xúc
- độ tương phản
- mức độ cao cấp.

==================================================
8. VISUAL
==================================================

Nếu có người:

- khuôn mặt tự nhiên
- cơ thể đúng tỷ lệ
- tư thế tự nhiên
- không biến dạng
- không lặp người

Nếu có sản phẩm:

- đúng hình dáng
- rõ nét
- không méo
- không nhân đôi
- không thêm sản phẩm không liên quan.

Nếu có ảnh tham khảo:

Phải ưu tiên visual được thể hiện trong ảnh mẫu,
trừ khi khách hàng yêu cầu thay đổi.

==================================================
9. TYPOGRAPHY
==================================================

AI tạo ảnh thường dễ làm chữ sai.

Vì vậy DESIGN PLAN phải xác định rõ:

- chữ nào quan trọng nhất
- chữ nào lớn nhất
- chữ nào phụ
- vị trí tương đối
- độ tương phản
- chiều rộng vùng chữ
- khả năng đọc từ xa.

Không tự thay đổi nội dung khách hàng cung cấp.

==================================================
10. BACKGROUND
==================================================

Background phải hỗ trợ nội dung.

Không được làm background lấn át headline.

Nếu khách hàng yêu cầu một màu cụ thể,
phải ưu tiên đúng màu đó.

==================================================
11. KHOẢNG TRỐNG
==================================================

Khoảng trống phải có chủ đích.

Không để khoảng trống lớn chỉ vì AI không biết
cách sử dụng canvas.

==================================================
12. IN ẤN
==================================================

Thiết kế phải phù hợp cho in ấn:

- hierarchy rõ
- tương phản tốt
- nội dung quan trọng tránh sát mép
- safe margin hợp lý
- bố cục cân bằng
- dễ đọc từ xa.

==================================================
13. NEGATIVE RULES
==================================================

Không:

- tự thêm thông tin
- tự thêm logo
- tự thêm số điện thoại
- tự thêm địa chỉ
- tự thêm thương hiệu
- tự tạo bố cục 3 panel
- tự đặt hình đối xứng hai bên nếu không phù hợp
- thu nhỏ toàn bộ thiết kế vào giữa
- tạo khoảng trống vô nghĩa
- nhân đôi người
- nhân đôi sản phẩm
- làm méo visual.

==================================================
14. SÁNG TẠO
==================================================

Không lặp lại một template cố định.

Hãy lựa chọn bố cục phù hợp nhất với:

- nội dung
- kích thước
- phong cách
- hình ảnh tham khảo.

==================================================

Hãy trả về JSON hợp lệ duy nhất.

Không markdown.
Không giải thích bên ngoài JSON.
`;

    /*
     * =========================================================
     *  USER CONTENT
     * =========================================================
     */

    const userContent = [
      {
        type: "input_text",
        text: `
THÔNG TIN THIẾT KẾ:

Loại thiết kế:
${designType || "Không xác định"}

Kích thước:
${w} × ${h} ${unit || "cm"}

Tỷ lệ:
${ratio.toFixed(3)}

Phong cách:
${style || "Tự lựa chọn phù hợp"}

Nội dung / yêu cầu:
${prompt}

${
  uploadedImage
    ? `
KHÁCH HÀNG ĐÃ CUNG CẤP ẢNH THAM KHẢO.

Hãy xem trực tiếp hình ảnh và phân tích nó.

Ảnh này có thể là:
- mẫu thiết kế
- ảnh chụp biển quảng cáo
- ảnh chụp backdrop
- ảnh JPG/PNG
- hình ảnh thiết kế từ điện thoại.

Hãy dùng hình ảnh làm REFERENCE DESIGN.
`
    : `
Không có ảnh tham khảo.
`
}

Hãy tạo DESIGN PLAN chi tiết.
`,
      },
    ];

    /*
     * =========================================================
     *  THÊM ẢNH THẬT VÀO AI
     * =========================================================
     */

    if (uploadedImage) {
      userContent.push({
        type: "input_image",
        image_url: uploadedImage,
      });
    }

    /*
     * =========================================================
     *  OPENAI RESPONSE
     * =========================================================
     */

    const response = await openai.responses.create({
      model: "gpt-5.4",

      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userContent,
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
      throw new Error(
        "AI không trả về Design Plan."
      );
    }

    let designPlan;

    try {
      designPlan = JSON.parse(outputText);
    } catch (parseError) {
      console.error(
        "Design Plan JSON parse error:",
        parseError
      );

      console.error(
        "Raw output:",
        outputText
      );

      throw new Error(
        "Không đọc được Design Plan từ AI."
      );
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
        hasReferenceImage:
          Boolean(uploadedImage),
      },
    });
  } catch (error) {
    console.error(
      "AI ART DIRECTOR ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo Design Plan.",
    });
  }
}
