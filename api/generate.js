import OpenAI, { toFile } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ------------------------------------------------------------
// AI DESIGN PRINT
// PANORAMA GENERATION ENGINE V5
// REFERENCE IMAGE ENGINE
// ------------------------------------------------------------

function getRatio(width, height) {
  const w = Number(width);
  const h = Number(height);

  if (!w || !h || w <= 0 || h <= 0) {
    return 1;
  }

  return w / h;
}

// ------------------------------------------------------------
// LAYOUT CLASSIFICATION
// ------------------------------------------------------------

function classifyLayout(ratio) {
  if (ratio >= 5) return "PANORAMA_EXTREME";
  if (ratio >= 3) return "PANORAMA_WIDE";
  if (ratio >= 2.5) return "WIDE";

  if (ratio <= 0.2) return "VERTICAL_EXTREME";
  if (ratio <= 0.7) return "TALL";

  return "STANDARD";
}

// ------------------------------------------------------------
// GPT IMAGE OUTPUT SIZE
// ------------------------------------------------------------

function getOutputSize(ratio) {
  // GPT-Image-2 hỗ trợ tỷ lệ tối đa khoảng 3:1.
  // Với panorama cực rộng, tạo ảnh trung gian 3:1
  // rồi frontend sẽ xử lý bước mở rộng tiếp theo.

  if (ratio >= 3) {
    return "1536x512";
  }

  if (ratio <= 0.333333) {
    return "512x1536";
  }

  if (ratio >= 2) {
    return "1536x768";
  }

  if (ratio >= 1) {
    return "1536x1024";
  }

  return "1024x1536";
}

// ------------------------------------------------------------
// PANORAMA INSTRUCTION
// ------------------------------------------------------------

function buildPanoramaInstruction(ratio) {
  if (ratio >= 5) {
    return `
THIS IS AN EXTREME-WIDE PANORAMA ADVERTISING DESIGN.

The requested physical format is extremely wide:
approximately ${ratio.toFixed(2)}:1.

DO NOT compose this as a centered poster.

The composition MUST intentionally use the entire horizontal canvas.

LEFT ZONE:

- supporting visual elements
- secondary imagery
- environmental details
- decorative graphics
- light effects
- patterns
- atmospheric details

CENTER ZONE:

- main advertising message
- main subject
- primary visual focus
- strongest typography hierarchy

RIGHT ZONE:

- complementary imagery
- secondary visual elements
- environmental details
- decorative graphics
- light effects
- patterns
- atmospheric details

IMPORTANT:

The left, center and right areas must visually connect.

They must look like ONE continuous advertising composition.

Do NOT create three separate panels.

Do NOT create a triptych.

Do NOT put everything in the center.

Do NOT leave large empty areas on either side.

Do NOT stretch people.

Do NOT stretch products.

Do NOT stretch logos.

Do NOT duplicate people.

Do NOT duplicate products.

Do NOT duplicate logos.

Do NOT mirror major objects.

Do NOT create artificial blank margins.

Do NOT make the artwork look like a small poster placed inside a huge canvas.

The visual density must flow naturally from left to center to right.

Use:

- continuous background
- depth
- lighting
- decorative elements
- secondary imagery
- atmospheric details
- gradients
- connected environmental elements

to naturally fill the entire canvas.

The extreme left and extreme right edges should contain supporting visual information.

Keep important text, logos and faces safely away from the extreme edges.

The result must look like a professionally designed large-format advertising backdrop or banner.
`;
  }

  if (ratio >= 3) {
    return `
Create a professional wide-format advertising composition.

Use the entire horizontal canvas.

Do not concentrate the design only in the center.

Distribute the composition naturally from left to center to right.

Use a strong central hierarchy while maintaining meaningful supporting visual elements on both sides.

Everything must belong to ONE continuous scene.

Do not create three panels.

Do not create a triptych.

Do not duplicate major objects.

Do not stretch people, products or logos.

Do not leave large empty areas at either side.

Keep important text and subjects inside safe margins.

The result should look like a professional large-format advertising banner or backdrop.
`;
  }

  if (ratio >= 2.5) {
    return `
Create a professional wide advertising design.

Use the complete horizontal canvas.

Balance the main message with supporting visual elements across the left, center and right areas.

Avoid placing everything in the center.

Maintain one continuous visual environment.

Do not create a triptych or separate panels.

Do not duplicate major subjects.

Keep text, logos and important objects inside safe margins.
`;
  }

  if (ratio <= 0.2) {
    return `
Create an extremely tall vertical advertising design.

Use the complete vertical canvas.

Distribute visual elements naturally from top to middle to bottom.

Do not compress the design into the center.

Do not stretch people, products or logos.

Keep important content inside safe margins.
`;
  }

  if (ratio <= 0.7) {
    return `
Create a professional vertical advertising composition.

Use the complete vertical canvas.

Balance the composition from top to middle to bottom.

Avoid concentrating all content in the center.

Maintain clear hierarchy and safe margins.
`;
  }

  return `
Create a professional advertising composition using the complete canvas.

Maintain strong hierarchy, balanced spacing and safe margins.

Do not stretch people, products, logos or important objects.
`;
}

// ------------------------------------------------------------
// REFERENCE IMAGE INSTRUCTION
// ------------------------------------------------------------

function buildReferenceInstruction(hasReferenceImage) {
  if (!hasReferenceImage) {
    return `
REFERENCE IMAGE:

No reference image was provided.

Create the artwork from the client's written requirements and Design Plan.
`;
  }

  return `
REFERENCE IMAGE:

A real reference image has been provided by the client.

YOU MUST USE THE REFERENCE IMAGE.

The reference image is a visual design instruction.

Analyze:

- overall composition
- layout structure
- visual hierarchy
- color direction
- typography placement
- subject placement
- background treatment
- decorative elements
- lighting
- atmosphere
- proportions
- design style

Use the reference image as a strong visual guide.

PRESERVE the important visual characteristics of the reference.

Do not simply ignore the reference.

Do not treat the reference as decorative content.

Do not place the reference image inside the final artwork.

Do not create a screenshot.

Do not create a mockup.

Instead, create a NEW advertising design based on the visual logic of the reference.

If the reference contains people, products, logos or important objects:

- preserve their visual role
- preserve their relative importance
- preserve the overall composition where appropriate
- do not randomly replace them
- do not duplicate them
- do not distort them

If the reference is primarily a layout example:

recreate its DESIGN LOGIC rather than simply copying the image itself.

The final result must be a professional advertising artwork inspired by the reference image.
`;
}

// ------------------------------------------------------------
// DESIGN PROMPT
// ------------------------------------------------------------

function buildPrompt({
  designType,
  width,
  height,
  unit,
  prompt,
  style,
  ratio,
  layout,
  designPlan,
  hasReferenceImage,
}) {
  const panoramaInstruction =
    buildPanoramaInstruction(ratio);

  const referenceInstruction =
    buildReferenceInstruction(
      hasReferenceImage
    );

  const planText = designPlan
    ? JSON.stringify(
        designPlan,
        null,
        2
      )
    : "No Design Plan available.";

  return `
You are a senior professional advertising designer specializing in:

- large-format printing
- advertising backdrops
- banners
- billboards
- commercial signage
- event graphics
- professional print design

PROJECT:

AI DESIGN PRINT

DESIGN TYPE:

${designType}

REQUESTED PHYSICAL SIZE:

${width} × ${height} ${unit}

REQUESTED ASPECT RATIO:

${ratio.toFixed(3)}:1

LAYOUT CLASS:

${layout}

DESIGN STYLE:

${style || "Hiện đại"}

CLIENT CONTENT:

${prompt || "Create an attractive professional advertising design."}

------------------------------------------------------------
AI ART DIRECTOR DESIGN PLAN
------------------------------------------------------------

${planText}

------------------------------------------------------------
REFERENCE IMAGE
------------------------------------------------------------

${referenceInstruction}

------------------------------------------------------------
PANORAMA COMPOSITION
------------------------------------------------------------

${panoramaInstruction}

------------------------------------------------------------
GENERAL DESIGN RULES
------------------------------------------------------------

1. Respect the requested physical dimensions.

2. Respect the intended aspect ratio.

3. Compose specifically for large-format printing.

4. Keep typography highly readable.

5. Establish clear visual hierarchy.

6. Use professional spacing.

7. Keep important content away from edges.

8. Never distort human bodies.

9. Never distort faces.

10. Never distort products.

11. Never distort logos.

12. Never duplicate people.

13. Never duplicate products.

14. Never duplicate logos.

15. Never create accidental mirrored objects.

16. Never create a three-panel composition.

17. Never place the entire design inside a small central area.

18. The background must support the entire canvas.

19. The composition must feel intentional from edge to edge.

20. Use professional advertising aesthetics.

------------------------------------------------------------
TEXT HIERARCHY
------------------------------------------------------------

The client's important text must be visually prominent.

Use clear hierarchy.

PRIMARY:
Main headline.

SECONDARY:
Supporting information.

TERTIARY:
Additional information.

Do not make every text element the same size.

Do not hide important text.

Do not place important text directly against the edge.

------------------------------------------------------------
EXTREME-WIDE FORMAT
------------------------------------------------------------

For extremely wide designs:

Think of the final artwork as a physical advertising banner stretched across a large wall.

The left side, center and right side must all contain meaningful visual information.

The center should carry the strongest message.

The sides should contain complementary graphics, environmental details, decorative elements and supporting imagery.

All areas must connect naturally into ONE continuous visual scene.

Do NOT simply place a normal poster in the middle.

Do NOT extend an empty background around a small poster.

Do NOT intentionally leave large blank areas on the left or right.

Do NOT use a border around the composition.

Do NOT use a fake canvas.

Do NOT use a mockup.

Create ONLY the actual advertising artwork.

------------------------------------------------------------
REFERENCE IMAGE PRIORITY
------------------------------------------------------------

When a reference image is provided:

The reference image is a major design instruction.

Use it to understand the client's intended visual direction.

Preserve the strongest characteristics of the reference while improving:

- composition
- readability
- proportions
- panoramic distribution
- advertising quality
- print suitability

Do not ignore the reference.

------------------------------------------------------------
FINAL QUALITY
------------------------------------------------------------

Professional commercial advertising design.

Clean composition.

Strong hierarchy.

Natural proportions.

Balanced panoramic distribution.

Professional typography placement.

Professional lighting.

Professional visual hierarchy.

Print-oriented visual quality.

The final result must look intentionally designed by a professional advertising designer.
`;
}

// ------------------------------------------------------------
// DATA URL → FILE
// ------------------------------------------------------------

async function dataUrlToFile(dataUrl) {
  if (
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith("data:image/")
  ) {
    throw new Error(
      "Ảnh tham khảo không đúng định dạng."
    );
  }

  const match = dataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
  );

  if (!match) {
    throw new Error(
      "Không đọc được dữ liệu ảnh tham khảo."
    );
  }

  const mimeType = match[1];
  const base64Data = match[2];

  const extension =
    mimeType === "image/jpeg"
      ? "jpg"
      : mimeType.split("/")[1] || "png";

  const buffer =
    Buffer.from(
      base64Data,
      "base64"
    );

  return toFile(
    buffer,
    "reference." + extension,
    {
      type: mimeType,
    }
  );
}

// ------------------------------------------------------------
// API HANDLER
// ------------------------------------------------------------

export default async function handler(
  req,
  res
) {
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
      aspectRatio,
      uploadedImage,
      designPlan,
    } = req.body || {};

    const w = Number(width);
    const h = Number(height);

    if (!w || !h || w <= 0 || h <= 0) {
      return res.status(400).json({
        error: "Kích thước không hợp lệ.",
      });
    }

    const ratio =
      Number(aspectRatio) > 0
        ? Number(aspectRatio)
        : getRatio(w, h);

    const layout =
      classifyLayout(ratio);

    const outputSize =
      getOutputSize(ratio);

    const hasReferenceImage =
      typeof uploadedImage === "string" &&
      uploadedImage.startsWith(
        "data:image/"
      );

    const finalPrompt =
      buildPrompt({
        designType,
        width: w,
        height: h,
        unit,
        prompt,
        style,
        ratio,
        layout,
        designPlan,
        hasReferenceImage,
      });

    console.log(
      "========================================"
    );

    console.log(
      "AI DESIGN PRINT GENERATE V5"
    );

    console.log("width:", w);
    console.log("height:", h);
    console.log("unit:", unit);
    console.log("ratio:", ratio);
    console.log("layout:", layout);
    console.log(
      "outputSize:",
      outputSize
    );
    console.log(
      "hasReferenceImage:",
      hasReferenceImage
    );
    console.log(
      "hasDesignPlan:",
      Boolean(designPlan)
    );

    console.log(
      "========================================"
    );

    // --------------------------------------------------------
    // MODE 1:
    // NO REFERENCE IMAGE
    // --------------------------------------------------------

    if (!hasReferenceImage) {
      console.log(
        "GENERATION MODE: TEXT ONLY"
      );

      const result =
        await openai.images.generate({
          model: "gpt-image-2",

          prompt: finalPrompt,

          size: outputSize,

          quality: "high",

          output_format: "png",
        });

      const imageBase64 =
        result?.data?.[0]?.b64_json;

      if (!imageBase64) {
        throw new Error(
          "AI không trả về hình ảnh."
        );
      }

      const image =
        "data:image/png;base64," +
        imageBase64;

      return res.status(200).json({
        image,
        width: w,
        height: h,
        unit,
        ratio,
        layout,
        outputSize,
        hasReferenceImage: false,
        needsOutpaint:
          ratio >= 2.5 ||
          ratio <= 0.7,
        promptVersion:
          "AI-DESIGN-PRINT-V5-TEXT-PANORAMA",
      });
    }

    // --------------------------------------------------------
    // MODE 2:
    // REFERENCE IMAGE
    // --------------------------------------------------------

    console.log(
      "GENERATION MODE: REFERENCE IMAGE"
    );

    const referenceFile =
      await dataUrlToFile(
        uploadedImage
      );

    const result =
      await openai.images.edit({
        model: "gpt-image-2",

        image: referenceFile,

        prompt: finalPrompt,

        size: outputSize,

        quality: "high",

        output_format: "png",

        input_fidelity: "high",
      });

    const imageBase64 =
      result?.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error(
        "AI không trả về hình ảnh sau khi sử dụng ảnh mẫu."
      );
    }

    const image =
      "data:image/png;base64," +
      imageBase64;

    return res.status(200).json({
      image,

      width: w,

      height: h,

      unit,

      ratio,

      layout,

      outputSize,

      hasReferenceImage: true,

      needsOutpaint:
        ratio >= 2.5 ||
        ratio <= 0.7,

      promptVersion:
        "AI-DESIGN-PRINT-V5-REFERENCE-PANORAMA",
    });
  } catch (error) {
    console.error(
      "========================================"
    );

    console.error(
      "AI DESIGN PRINT GENERATE ERROR:"
    );

    console.error(error);

    console.error(
      "========================================"
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo thiết kế AI.",
    });
  }
}
