import OpenAI, { toFile } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =====================================================
// TỶ LỆ & KÍCH THƯỚC
// =====================================================

function getRatio(width, height) {
  if (!width || !height) {
    return 1;
  }

  return Number(width) / Number(height);
}

function classifyLayout(ratio) {
  if (ratio >= 2.5) {
    return "ultra-wide";
  }

  if (ratio >= 1.5) {
    return "landscape";
  }

  if (ratio <= 0.7) {
    return "ultra-tall";
  }

  if (ratio <= 0.9) {
    return "portrait";
  }

  return "square";
}

function getOutputSize(ratio) {
  if (ratio >= 1.5) {
    return "1536x1024";
  }

  if (ratio <= 0.9) {
    return "1024x1536";
  }

  return "1024x1024";
}

function needsOutpaint(ratio) {
  return ratio >= 2.5 || ratio <= 0.7;
}

// =====================================================
// DATA URL → FILE
// =====================================================

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

  let extension = "png";

  if (mimeType === "image/jpeg") {
    extension = "jpg";
  } else if (mimeType === "image/webp") {
    extension = "webp";
  } else if (mimeType === "image/png") {
    extension = "png";
  }

  const buffer = Buffer.from(
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

// =====================================================
// PROMPT
// =====================================================

function buildPrompt({
  designType,
  width,
  height,
  unit,
  prompt,
  style,
  designPlan,
  hasReferenceImage,
}) {
  const planText =
    designPlan &&
    typeof designPlan === "object"
      ? JSON.stringify(
          designPlan,
          null,
          2
        )
      : "";

  // ===================================================
  // TRƯỜNG HỢP CÓ ẢNH KHÁCH GỬI
  // ===================================================

  if (hasReferenceImage) {
    return `
You are an expert advertising graphic designer and art director
specialized in professional large-format printing.

You are given TWO sources of information:

1. A reference photo supplied by the customer.
2. A new design brief supplied by the customer.

The reference photo may be a photograph of an old banner,
backdrop, signboard, poster, printed advertisement or another
real-world design.

IMPORTANT:

THE REFERENCE IMAGE IS NOT A LAYOUT TEMPLATE.

DO NOT COPY THE ORIGINAL COMPOSITION.

DO NOT RECREATE THE SAME LAYOUT.

DO NOT SIMPLY IMPROVE THE ORIGINAL IMAGE.

Instead, first understand the information contained in the
reference image, then CREATE A NEW PROFESSIONAL DESIGN.

=====================================================
CUSTOMER REQUEST
=====================================================

Design type:
${designType}

Final physical size:
${width} × ${height} ${unit}

Visual style:
${style}

Customer instruction:
${prompt}

=====================================================
DESIGN PLAN
=====================================================

${planText}

=====================================================
REFERENCE IMAGE INSTRUCTIONS
=====================================================

Analyze the supplied reference image and identify useful
information such as:

- exact visible wording
- subject matter
- people
- products
- logos
- important symbols
- important objects
- colors
- brand identity
- theme
- event information
- visual style
- overall message

USE THE INFORMATION.

BUT DO NOT COPY THE ORIGINAL LAYOUT.

The new design MUST have a clearly different composition.

Change the visual structure substantially.

For example:

- move the main headline to a better position
- change the relationship between headline and visual
- redesign the background
- create a stronger focal point
- reorganize supporting information
- change decorative elements
- improve spacing
- improve typography hierarchy
- create better visual balance
- use more dynamic visual flow
- make the design more attractive and professional

The result should look like a PROFESSIONAL DESIGNER CREATED
A NEW DESIGN BASED ON THE CUSTOMER'S INFORMATION.

=====================================================
VERY IMPORTANT
=====================================================

The customer specifically wants a NEW COMPOSITION.

Therefore:

DO NOT reproduce the original arrangement.

DO NOT keep the same text positions.

DO NOT keep the same object positions unless necessary
for identity or brand recognition.

DO NOT make a near-copy of the reference.

DO NOT put everything into the same central cluster.

DO NOT make the result look like a simple redraw.

CREATE A FRESH ART-DIRECTED COMPOSITION.

=====================================================
TEXT
=====================================================

If readable text exists in the reference image and is relevant
to the customer request, preserve the important wording.

If the customer gives new wording, prioritize the customer's
new wording.

Do not invent unrelated information.

Do not invent phone numbers.

Do not invent addresses.

Do not invent logos.

=====================================================
QUALITY
=====================================================

The final design must be:

- professional
- attractive
- modern
- visually balanced
- suitable for advertising
- suitable for large-format printing
- clear at a distance
- visually engaging
- not cluttered
- not boring
- not a copy of the reference

Use the entire canvas effectively.

Create a strong hierarchy:

1. Main message
2. Important supporting message
3. Main visual subject
4. Secondary information
5. Decorative/background elements

Make the main content large and readable.

Avoid unnecessary empty areas.

Avoid a tiny design floating in the middle.

Avoid three-panel compositions.

The final result must feel like a NEW PROFESSIONAL
ADVERTISING DESIGN.
`;
  }

  // ===================================================
  // TRƯỜNG HỢP KHÔNG CÓ ẢNH
  // ===================================================

  return `
You are an expert advertising graphic designer and art director
specialized in professional large-format printing.

Create a professional ${designType} design.

=====================================================
SIZE
=====================================================

${width} × ${height} ${unit}

=====================================================
STYLE
=====================================================

${style}

=====================================================
CUSTOMER REQUEST
=====================================================

${prompt}

=====================================================
DESIGN PLAN
=====================================================

${planText}

=====================================================
DESIGN REQUIREMENTS
=====================================================

Create a complete professional advertising composition.

Use the entire canvas effectively.

Create a strong visual hierarchy:

- main headline
- supporting information
- main visual
- secondary information
- background
- decorative elements

Important text must be large and readable.

Do not create a tiny centered composition.

Do not create unnecessary white borders.

Do not create a three-panel layout.

Do not duplicate people, products or important objects.

Do not add unrelated text.

Do not invent phone numbers or addresses.

The design should look like professional commercial
advertising artwork prepared for printing.

Make the composition attractive, modern and visually balanced.

=====================================================
FINAL OUTPUT
=====================================================

Professional advertising artwork suitable for large-format
printing.
`;
}

// =====================================================
// API
// =====================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
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
      aspectRatio,
      designPlan,
      uploadedImage,
    } = req.body || {};

    // =================================================
    // KIỂM TRA DỮ LIỆU
    // =================================================

    const numericWidth = Number(width);
    const numericHeight = Number(height);

    if (
      !Number.isFinite(numericWidth) ||
      !Number.isFinite(numericHeight) ||
      numericWidth <= 0 ||
      numericHeight <= 0
    ) {
      return res.status(400).json({
        error:
          "Kích thước W × H không hợp lệ.",
      });
    }

    if (
      !prompt ||
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {
      return res.status(400).json({
        error:
          "Vui lòng nhập nội dung thiết kế.",
      });
    }

    // =================================================
    // TỶ LỆ
    // =================================================

    const ratio =
      Number.isFinite(Number(aspectRatio)) &&
      Number(aspectRatio) > 0
        ? Number(aspectRatio)
        : getRatio(
            numericWidth,
            numericHeight
          );

    const layout =
      classifyLayout(ratio);

    const outputSize =
      getOutputSize(ratio);

    const expandRequired =
      needsOutpaint(ratio);

    // =================================================
    // PROMPT
    // =================================================

    const finalPrompt = buildPrompt({
      designType,
      width: numericWidth,
      height: numericHeight,
      unit,
      prompt,
      style,
      designPlan,
      hasReferenceImage:
        Boolean(uploadedImage),
    });

    console.log(
      "AI DESIGN PRINT GENERATE:",
      {
        designType,
        width: numericWidth,
        height: numericHeight,
        unit,
        ratio,
        layout,
        outputSize,
        hasReferenceImage:
          Boolean(uploadedImage),
      }
    );

    // =================================================
    // TẠO ẢNH
    // =================================================

    let result;

    // -------------------------------------------------
    // KHÔNG CÓ ẢNH THAM KHẢO
    // -------------------------------------------------

    if (!uploadedImage) {
      console.log(
        "MODE: CREATE NEW DESIGN"
      );

      result =
        await openai.images.generate({
          model: "gpt-image-2",

          prompt: finalPrompt,

          size: outputSize,

          quality: "high",

          output_format: "png",
        });
    }

    // -------------------------------------------------
    // CÓ ẢNH THAM KHẢO
    // -------------------------------------------------

    else {
      console.log(
        "MODE: REFERENCE → NEW DESIGN"
      );

      const referenceFile =
        await dataUrlToFile(
          uploadedImage
        );

      result =
        await openai.images.edit({
          model: "gpt-image-2",

          image: referenceFile,

          prompt: finalPrompt,

          size: outputSize,

          quality: "high",

          output_format: "png",
        });
    }

    // =================================================
    // KIỂM TRA KẾT QUẢ
    // =================================================

    if (
      !result ||
      !result.data ||
      !result.data[0]
    ) {
      throw new Error(
        "AI không trả về dữ liệu hình ảnh."
      );
    }

    const imageData =
      result.data[0];

    const imageBase64 =
      imageData.b64_json;

    if (!imageBase64) {
      throw new Error(
        "AI không trả về dữ liệu ảnh base64."
      );
    }

    const image =
      "data:image/png;base64," +
      imageBase64;

    // =================================================
    // TRẢ KẾT QUẢ
    // =================================================

    return res.status(200).json({
      success: true,

      image,

      width: numericWidth,

      height: numericHeight,

      unit,

      ratio,

      layout,

      outputSize,

      hasReferenceImage:
        Boolean(uploadedImage),

      needsOutpaint:
        expandRequired,

      promptVersion:
        "AI DESIGN PRINT V1.0 PRO - REDESIGN",

    });
  } catch (error) {
    console.error(
      "GENERATE API ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Không thể tạo thiết kế.",
    });
  }
}
