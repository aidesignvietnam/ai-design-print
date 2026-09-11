import OpenAI from "openai";

const client = new OpenAI({
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
      designType = "Backdrop",
      width = 300,
      height = 270,
      unit = "cm",
      prompt = "",
      style = "Hiện đại",
    } = req.body || {};

    // --------------------------------------------------
    // 1. KIỂM TRA KÍCH THƯỚC
    // --------------------------------------------------

    const w = Number(width);
    const h = Number(height);

    if (
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w <= 0 ||
      h <= 0
    ) {
      return res.status(400).json({
        error: "Kích thước W × H không hợp lệ.",
      });
    }

    // --------------------------------------------------
    // 2. TÍNH TỶ LỆ THỰC
    // --------------------------------------------------

    const aspectRatio = w / h;

    // --------------------------------------------------
    // 3. XÁC ĐỊNH LOẠI BỐ CỤC
    // --------------------------------------------------

    let layoutType = "";
    let layoutInstruction = "";

    if (aspectRatio >= 5) {
      layoutType = "EXTREME PANORAMIC";

      layoutInstruction = `
EXTREMELY WIDE PANORAMIC ADVERTISING BANNER.

The physical design ratio is:
${w} × ${h} ${unit}

Exact ratio:
${aspectRatio.toFixed(4)} : 1

This is an extremely wide horizontal advertising banner.

IMPORTANT:
- The composition MUST be strongly horizontal.
- Extend the visual composition across the entire width.
- Do NOT create a square image.
- Do NOT create a 1:1 composition.
- Do NOT create a 4:3 composition.
- Do NOT create a 3:2 composition.
- Do NOT create a normal poster.
- Do NOT place everything in the center.
- Spread visual elements naturally from LEFT to RIGHT.
- Keep important text readable across the wide canvas.
- Leave safe margins around important text.
`;
    } else if (aspectRatio >= 2.5) {
      layoutType = "WIDE PANORAMIC";

      layoutInstruction = `
WIDE PANORAMIC ADVERTISING DESIGN.

Physical size:
${w} × ${h} ${unit}

Exact ratio:
${aspectRatio.toFixed(4)} : 1

Create a strongly horizontal advertising composition.

Use the full width of the canvas.

Avoid:
- square composition
- portrait composition
- 3:2 poster composition
- centered compact composition

Spread the visual hierarchy across the entire horizontal canvas.
`;
    } else if (aspectRatio >= 1.15) {
      layoutType = "LANDSCAPE";

      layoutInstruction = `
HORIZONTAL LANDSCAPE ADVERTISING DESIGN.

Physical size:
${w} × ${h} ${unit}

Exact ratio:
${aspectRatio.toFixed(4)} : 1

Create a horizontal advertising composition.

Use the entire canvas width and height.

Keep all important information inside safe margins.
`;
    } else if (aspectRatio <= 0.2) {
      layoutType = "EXTREME VERTICAL";

      layoutInstruction = `
EXTREMELY TALL VERTICAL ADVERTISING DESIGN.

Physical size:
${w} × ${h} ${unit}

Exact ratio:
${aspectRatio.toFixed(4)} : 1

Create an extremely tall vertical advertising composition.

Do NOT create a square image.
Do NOT create a landscape image.

Use the full vertical space.
`;
    } else if (aspectRatio <= 0.55) {
      layoutType = "TALL VERTICAL";

      layoutInstruction = `
TALL VERTICAL ADVERTISING DESIGN.

Physical size:
${w} × ${h} ${unit}

Exact ratio:
${aspectRatio.toFixed(4)} : 1

Create a strong vertical advertising composition.

Use the full height of the canvas.
`;
    } else if (aspectRatio < 0.87) {
      layoutType = "PORTRAIT";

      layoutInstruction = `
PORTRAIT ADVERTISING DESIGN.

Physical size:
${w} × ${h} ${unit}

Exact ratio:
${aspectRatio.toFixed(4)} : 1

Create a vertical advertising composition.

Use the entire canvas.
`;
    } else {
      layoutType = "NEAR SQUARE";

      layoutInstruction = `
BALANCED ADVERTISING DESIGN.

Physical size:
${w} × ${h} ${unit}

Exact ratio:
${aspectRatio.toFixed(4)} : 1

Create a balanced composition using the entire canvas.
`;
    }

    // --------------------------------------------------
    // 4. TẠO PROMPT CHO GPT-IMAGE-2
    // --------------------------------------------------

    const designPrompt = `
You are a professional commercial advertising graphic designer.

Create a professional advertising artwork for large-format printing.

==================================================
DESIGN INFORMATION
==================================================

DESIGN TYPE:
${designType}

PHYSICAL WIDTH:
${w} ${unit}

PHYSICAL HEIGHT:
${h} ${unit}

EXACT ASPECT RATIO:
${aspectRatio.toFixed(4)} : 1

LAYOUT TYPE:
${layoutType}

==================================================
LAYOUT
==================================================

${layoutInstruction}

==================================================
VISUAL STYLE
==================================================

${style}

==================================================
USER DESIGN REQUEST
==================================================

${prompt || "Create an attractive professional advertising design suitable for printing."}

==================================================
PROFESSIONAL DESIGN REQUIREMENTS
==================================================

1. Respect the requested physical W × H ratio.

2. The visual composition must strongly match the requested aspect ratio.

3. Use the entire available canvas.

4. Do not create a generic square image unless the requested ratio is near square.

5. Do not create a generic 3:2 poster composition.

6. Do not unnecessarily crop important subjects.

7. Keep important text and logos inside safe margins.

8. Create strong visual hierarchy.

9. Make important typography large and readable.

10. Use professional commercial advertising design principles.

11. The design should look suitable for Vietnamese advertising.

12. Use professional spacing and alignment.

13. Avoid unnecessary decorative borders.

14. Avoid empty unused areas unless intentionally required by the design.

15. No watermark.

16. No mockup.

17. No photograph of the printed banner.

18. Create the actual flat advertising artwork.

19. The result must look like artwork that can be sent to a printing company.

20. IMPORTANT:
The requested ratio is ${aspectRatio.toFixed(4)} : 1.
Do not reinterpret the requested design as a square, portrait,
or ordinary landscape poster.

==================================================
TEXT HANDLING
==================================================

If the user provides text:

- Preserve the requested wording as accurately as possible.
- Make important text prominent.
- Use clear Vietnamese-friendly typography.
- Do not randomly invent important names, phone numbers,
  addresses, dates or event information.
- Do not hide important text behind decorative elements.

==================================================
FINAL OUTPUT
==================================================

Generate one professional advertising artwork.

The composition should visually correspond to:

${w} × ${h} ${unit}

Ratio:

${aspectRatio.toFixed(4)} : 1
`;

    // --------------------------------------------------
    // 5. CHỌN KÍCH THƯỚC OUTPUT
    // --------------------------------------------------
    //
    // GPT-Image-2 có các kích thước output giới hạn.
    // Chúng ta chọn hướng phù hợp với thiết kế.
    //
    // Không dùng 1536x1024 cho mọi thiết kế nữa.
    // --------------------------------------------------

    let outputSize = "1024x1024";

    if (aspectRatio >= 1.15) {
      outputSize = "1536x1024";
    } else if (aspectRatio < 0.87) {
      outputSize = "1024x1536";
    } else {
      outputSize = "1024x1024";
    }

    // --------------------------------------------------
    // 6. GỌI GPT-IMAGE-2
    // --------------------------------------------------

    const result = await client.images.generate({
      model: "gpt-image-2",
      prompt: designPrompt,
      size: outputSize,
      quality: "medium",
    });

    // --------------------------------------------------
    // 7. LẤY ẢNH BASE64
    // --------------------------------------------------

    const imageBase64 = result.data?.[0]?.b64_json;

    if (!imageBase64) {
      return res.status(500).json({
        error: "AI không trả về hình ảnh.",
      });
    }

    // --------------------------------------------------
    // 8. TRẢ KẾT QUẢ VỀ FRONTEND
    // --------------------------------------------------

    return res.status(200).json({
      success: true,

      image: `data:image/png;base64,${imageBase64}`,

      width: w,

      height: h,

      unit,

      aspectRatio,

      outputSize,

      layoutType,
    });
  } catch (error) {
    console.error("OpenAI image generation error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo thiết kế bằng AI.",
    });
  }
}
