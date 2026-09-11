import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function json(res, status, data) {
  return res.status(status).json(data);
}

function getRatio(width, height) {
  return Number(width) / Number(height);
}

function getLayout(width, height) {
  const ratio = getRatio(width, height);

  if (ratio >= 4.5) {
    return "ULTRA_WIDE";
  }

  if (ratio >= 2.5) {
    return "WIDE";
  }

  if (ratio <= 0.45) {
    return "ULTRA_TALL";
  }

  if (ratio <= 0.7) {
    return "TALL";
  }

  return "STANDARD";
}

/*
 * OpenAI Image API dùng các kích thước ảnh chuẩn.
 *
 * Với các banner cực rộng như:
 * 400 x 70 cm
 * 500 x 80 cm
 * 600 x 100 cm
 *
 * Không được kéo méo ảnh.
 *
 * Ảnh AI ban đầu sẽ được tạo theo landscape
 * để giữ chất lượng và bố cục chính.
 *
 * Phần xử lý thành tỷ lệ in thực tế sẽ được
 * thực hiện ở bước xử lý ảnh tiếp theo.
 */
function getOutputSize(layout) {
  if (layout === "ULTRA_TALL") {
    return "1024x1536";
  }

  if (layout === "TALL") {
    return "1024x1536";
  }

  return "1536x1024";
}

function buildPrompt({
  width,
  height,
  unit,
  designType,
  style,
  content,
  layout,
}) {
  const ratio = getRatio(width, height);

  const sizeText = `${width} ${unit} × ${height} ${unit}`;

  let layoutInstruction = "";

  if (layout === "ULTRA_WIDE") {
    layoutInstruction = `
ULTRA-WIDE LARGE FORMAT:

The requested physical size is:
${sizeText}

The requested aspect ratio is:
${ratio.toFixed(3)} : 1

This is a very wide advertising production.

IMPORTANT:
The final design concept must be suitable for expansion
into the requested panoramic format.

Create ONE continuous advertising scene.

Do NOT create:
- three panels
- three separate images
- repeated sections
- duplicated people
- duplicated products
- duplicated logos
- duplicated typography
- mirrored subjects
- tiled backgrounds
- collage layouts
- mockup frames

The main subject must appear ONLY ONCE.

Keep the main subject and important advertising information
together as ONE coherent composition.

Use natural surrounding background space that can visually
continue toward the left and right sides.

Suitable surrounding elements include:
- environment
- architecture
- soft gradients
- lighting
- decorative shapes
- textures
- atmospheric effects
- natural scenery
- subtle depth

The composition must look like ONE professionally designed
large-format advertising banner.

Do not make the artwork look like several pictures joined together.

Do not leave large accidental white spaces.

Do not stretch people.

Do not stretch products.

Do not distort logos.

Do not distort important objects.

Do not place the design inside a frame.

Generate the FLAT ADVERTISING ARTWORK itself.
`;

  } else if (layout === "WIDE") {
    layoutInstruction = `
WIDE ADVERTISING FORMAT:

Create ONE continuous horizontal advertising composition.

Keep the main subject visible only ONCE.

Do not duplicate:
- people
- products
- logos
- typography

Use natural horizontal background space around the main subject.

The composition should feel like one professional advertising banner.
`;

  } else if (layout === "ULTRA_TALL") {
    layoutInstruction = `
ULTRA-TALL LARGE FORMAT:

The requested physical size is:
${sizeText}

The requested aspect ratio is:
${ratio.toFixed(3)} : 1

Create ONE continuous vertical advertising composition.

The main subject must appear ONLY ONCE.

Do not duplicate:
- people
- products
- logos
- typography

Use compatible background, lighting and decorative elements
above and below the main subject.

Do not create repeated panels.

Do not create a collage.
`;

  } else if (layout === "TALL") {
    layoutInstruction = `
VERTICAL ADVERTISING FORMAT:

Create ONE continuous vertical composition.

Keep the main subject visible only ONCE.

Do not duplicate the main subject.

Do not duplicate typography.

Use natural vertical background space.
`;

  } else {
    layoutInstruction = `
STANDARD ADVERTISING FORMAT:

Create one balanced professional advertising composition.

Keep the main subject clear and visually dominant.

Do not duplicate the main subject.
`;
  }

  return `
You are a senior professional advertising art director
specialized in commercial advertising and large-format printing.

Create the actual FLAT ADVERTISING ARTWORK.

DESIGN TYPE:
${designType || "Backdrop"}

REQUESTED PHYSICAL SIZE:
${sizeText}

REQUESTED ASPECT RATIO:
${ratio.toFixed(3)} : 1

VISUAL STYLE:
${style || "Hiện đại"}

USER'S DESIGN BRIEF:
${content || "Thiết kế quảng cáo chuyên nghiệp."}

${layoutInstruction}

PROFESSIONAL DESIGN REQUIREMENTS:

1. Create a polished commercial advertising design.

2. Establish a strong visual hierarchy.

3. Make the main message easy to read.

4. Keep the main visual subject prominent.

5. Use professional typography hierarchy.

6. Maintain balanced spacing.

7. Use high-quality visual composition.

8. Make the design appropriate for large-format printing.

9. Keep the requested visual style consistent.

10. Avoid unnecessary objects.

11. Do not add random slogans.

12. Do not add unrelated text.

13. Do not add watermarks.

14. Do not show a computer screen.

15. Do not show a wall mockup.

16. Do not show a billboard mockup.

17. Do not put the artwork inside a physical frame.

18. Generate the actual flat artwork.

TEXT RULES:

The user's supplied content is authoritative.

Use the requested wording.

Do not invent unrelated wording.

Do not add fake company names.

Do not add fake phone numbers.

Do not add fake addresses.

Keep important text readable.

LARGE FORMAT RULE:

The physical dimensions supplied by the user are authoritative.

Do not redesign a very wide banner as a normal poster.

For extremely wide formats, think in terms of a professional
panoramic advertising environment.

The central subject must remain coherent.

The background should contain natural visual continuation
space so that the artwork can later be expanded horizontally
without changing or duplicating the main subject.

IMPORTANT:

This is not a mockup.

This is not a presentation.

This is not three separate designs.

This is ONE finished advertising artwork.
`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return json(res, 405, {
        error: "Method not allowed",
      });
    }

    const body = req.body || {};

    const width = Number(body.width);
    const height = Number(body.height);

    const unit = body.unit || "cm";

    const designType =
      body.designType || "Backdrop";

    const style =
      body.style || "Hiện đại";

    const content =
      body.content ||
      body.prompt ||
      "Thiết kế quảng cáo chuyên nghiệp.";

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return json(res, 400, {
        error:
          "Chiều rộng và chiều cao phải lớn hơn 0.",
      });
    }

    const ratio = getRatio(width, height);

    const layout = getLayout(width, height);

    const outputSize = getOutputSize(layout);

    const designPrompt = buildPrompt({
      width,
      height,
      unit,
      designType,
      style,
      content,
      layout,
    });

    console.log("AI DESIGN PRINT REQUEST:", {
      width,
      height,
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

    const image = response?.data?.[0]?.b64_json;

    if (!image) {
      throw new Error(
        "OpenAI không trả về ảnh thiết kế."
      );
    }

    return json(res, 200, {
      image:
        "data:image/png;base64," +
        image,

      width,
      height,
      unit,

      targetRatio: ratio,

      layout,

      outputSize,

      designType,

      style,

      /*
       * Báo cho frontend biết đây là định dạng
       * cần xử lý tỷ lệ đặc biệt ở bước tiếp theo.
       */
      requiresAspectProcessing:
        layout === "ULTRA_WIDE" ||
        layout === "ULTRA_TALL",

      /*
       * Phiên bản prompt mới.
       */
      promptVersion:
        "AI-DESIGN-PRINT-PANORAMIC-V3",
    });

  } catch (error) {
    console.error(
      "GENERATE ERROR:",
      error
    );

    return json(res, 500, {
      error:
        error?.message ||
        "Không thể tạo thiết kế AI.",
    });
  }
}
