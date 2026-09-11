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

function getOutputSize(layout) {
  /*
   * OpenAI image API hiện dùng các kích thước chuẩn.
   * Với banner siêu ngang, dùng ảnh landscape
   * làm artwork chất lượng cao ban đầu.
   */
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
SPECIAL LARGE-FORMAT COMPOSITION:

The requested physical format is:
${sizeText}

Aspect ratio:
${ratio.toFixed(3)} : 1

This is an EXTREMELY WIDE advertising banner.

Design it as ONE continuous panoramic composition.

CRITICAL COMPOSITION RULES:

- The main advertising subject must appear ONLY ONCE.
- Never duplicate the main subject.
- Never create three repeated panels.
- Never mirror the main subject.
- Never tile the composition.
- Never repeat people.
- Never repeat products.
- Never repeat logos.
- Never repeat the same typography.
- Never place a duplicate version of the design on the left or right.

The main content should be large, clearly visible and visually dominant.

Place the important advertising information inside a strong central safe area.

Use the left and right areas primarily for:
- background
- environmental space
- gradients
- decorative elements
- lighting
- textures
- atmospheric depth
- supporting visual elements

The left and right sides must visually connect to the central composition.

The entire banner must feel like ONE professionally art-directed large-format advertising design.

Do not make it look like three images joined together.

Do not leave empty white areas.

Do not stretch people or products.

Do not distort important objects.

The final artwork should be suitable as the master artwork for a very wide printed banner.
`;
  } else if (layout === "WIDE") {
    layoutInstruction = `
WIDE ADVERTISING FORMAT:

Create one continuous horizontal composition.

Keep the main subject visible only once.

Use the surrounding horizontal space for background,
decorative elements and visual breathing room.

Do not duplicate the main subject or typography.
`;
  } else if (layout === "ULTRA_TALL") {
    layoutInstruction = `
SPECIAL LARGE-FORMAT VERTICAL COMPOSITION:

The requested physical format is:
${sizeText}

Create ONE continuous vertical advertising composition.

The main subject must appear only once.

Do not duplicate people, products, logos or typography.

Use the upper and lower areas for compatible background,
lighting, atmosphere and decorative elements.

Do not create repeated panels.
`;
  } else if (layout === "TALL") {
    layoutInstruction = `
VERTICAL ADVERTISING FORMAT:

Create one continuous vertical composition.

Keep the main subject visible only once.

Do not duplicate the main subject or typography.
`;
  } else {
    layoutInstruction = `
STANDARD ADVERTISING FORMAT:

Create one balanced professional composition.

Keep the main subject clear and visually dominant.
`;
  }

  return `
You are an expert professional advertising art director
specialized in large-format printing.

CREATE A PROFESSIONAL ADVERTISING DESIGN.

DESIGN TYPE:
${designType || "Backdrop"}

PHYSICAL SIZE REQUESTED BY USER:
${sizeText}

ASPECT RATIO:
${ratio.toFixed(3)} : 1

STYLE:
${style || "Modern"}

USER CONTENT:
${content || "Create a professional advertising composition."}

${layoutInstruction}

GENERAL DESIGN REQUIREMENTS:

- Professional commercial advertising quality.
- Strong visual hierarchy.
- Excellent typography hierarchy.
- Clear focal point.
- Good negative space.
- Balanced composition.
- High visual impact.
- Suitable for large-format printing.
- Use the requested style consistently.
- Do not create unnecessary objects.
- Do not create duplicate subjects.
- Do not add random text.
- Do not add watermarks.
- Do not create mockup frames.
- Do not show the design hanging on a wall.
- Do not show a computer screen.
- Generate the actual flat advertising artwork.

TEXT REQUIREMENT:

The user's requested wording is the content of the advertisement.

Do not invent additional slogans or unrelated wording.

Keep the main text readable and visually prominent.

IMPORTANT:

The physical dimensions entered by the user are authoritative.

Do NOT redesign the requested format into a normal poster.

If the requested format is extremely wide,
the composition must visibly behave like a panoramic advertising banner.

The result should be a single intentional advertising artwork,
not a repeated or tiled image.
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

    const response =
      await openai.images.generate({
        model: "gpt-image-2",
        prompt: designPrompt,
        size: outputSize,
        quality: "high",
      });

    const image =
      response?.data?.[0]?.b64_json;

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

      requiresAspectProcessing:
        layout === "ULTRA_WIDE" ||
        layout === "ULTRA_TALL",

      promptVersion:
        "AI-DESIGN-PRINT-PANORAMIC-V2",
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
