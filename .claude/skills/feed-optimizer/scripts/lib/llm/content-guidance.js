// Per-category best-practice guidance for the content action, distilled from the PPC Mastery SOPs
// (`sops/Product Title Catalog.md` + `sops/Product Description Catalog.md`). The prompt injects ONLY
// the block matching a product's `catalog_type` (see buildMessages in openai-client-content.js), so
// each per-product call gets category-expert guidance without carrying all nine catalogs.
//
// These are HIGH-CONVERTING SHOPPING best practices — they steer word choice, attribute priority,
// and ordering. They are NOT a fact source: every concrete claim must still be grounded in the
// product's own evidence (old title, description, structured attributes, image). The catalog_type
// keys match spec-content.js / catalog-type.js exactly.

// Shared do/don't rules (the SOP "common mistakes" table), prepended to every block.
const SHARED_DONTS = [
  'Do not keyword-stuff or repeat the product type ("shoes running shoes athletic shoes").',
  'Do not bury key info — brand/product type/top attribute go first.',
  'No promotional or price text, no ALL-CAPS for emphasis.',
  'Each variant must read uniquely (its own color/size), never a shared generic title.',
].join(' ');

// title_priority: the SOP "include when" attribute order for the category (front-load earliest).
// example: a SOP before -> after that shows the target structure for the category.
export const GUIDANCE_BY_CATALOG_TYPE = {
  fashion_apparel: {
    title_priority: 'Brand, Gender (always), Product type, Color (always), Size (variants), Material, Pattern, Style/fit.',
    example: { before: 'Running shoes', after: "Nike Air Zoom Pegasus 40 Women's Running Shoes Black Size 8" },
    description_shape: 'Lead with brand + product + who it is for; then material, key features, color, fit. Natural sentences, benefit-framed.',
  },
  electronics: {
    title_priority: 'Brand, Model number (always), Capacity/specs (always: GB/TB/resolution), Product type, Key features (wireless, noise-cancelling), Compatibility, Color/generation.',
    example: { before: 'Wireless headphones', after: 'Sony WH-1000XM5 Wireless Noise Cancelling Over-Ear Headphones Black' },
    description_shape: 'Lead with brand + product + headline spec; then key specs, use case, compatibility, what is in the box, finish/color.',
  },
  consumables_health_beauty: {
    title_priority: 'Brand, Product line/name, Product type, Size/amount (always: ml/oz/count), Strength/dosage (mg/IU), Flavor/scent, Format (tablets/powder), Target audience.',
    example: { before: 'Protein powder', after: 'Optimum Nutrition Gold Standard Whey Protein Powder 5lb Chocolate' },
    description_shape: 'Lead with brand + product + primary benefit; then active ingredient/amount per serving, who it is for, format, servings/quantity, usage.',
  },
  home_furniture: {
    title_priority: 'Brand, Model/line, Product type, Dimensions (always), Material (always), Color (always), Style (modern/mid-century), Room, Assembly.',
    example: { before: 'Desk', after: 'Flexispot E7 Standing Desk 55x28 Inch Electric Height Adjustable Black' },
    description_shape: 'Lead with brand + product + room/use; then material, dimensions, key features, color/finish, assembly note.',
  },
  books_media: {
    title_priority: 'Title, Author (always), Format (always: hardcover/paperback/ebook/audiobook), ISBN (when available), Edition, Version.',
    example: { before: 'Self-help book', after: 'Atomic Habits James Clear Hardcover 9780735211292' },
    description_shape: 'Lead with title + author + format; then subject/theme, edition/version, who it is for.',
  },
  seasonal_occasion: {
    title_priority: 'Occasion (always: Christmas/Halloween/Birthday), Product type, Size/capacity (always), Colors (always), Features (pre-lit/reusable), Indoor/outdoor.',
    example: { before: 'String lights', after: 'Christmas Pre-Lit Artificial Tree 7ft 400 LED Lights Green' },
    description_shape: 'Lead with occasion + product + use; then size/capacity, colors, features, indoor/outdoor.',
  },
  sports_outdoors: {
    title_priority: 'Brand, Product line/model, Product type, Size/weight/material, Use case, Key features, Color.',
    example: { before: 'Yoga mat', after: 'Manduka PRO Yoga Mat 6mm Thick 71 Inch Black Non-Slip' },
    description_shape: 'Lead with brand + product + use case; then size/weight/material, key features, color, durability/benefit.',
  },
  automotive: {
    title_priority: 'Year/Make/Model compatibility (front, always when applicable), Product type, Brand, Material/specs, Quantity, Color.',
    example: { before: 'Brake pads', after: '2018-2022 Toyota Camry Front Brake Pads Ceramic Bosch' },
    description_shape: 'Lead with compatibility + product + brand; then material/specs, fitment notes, quantity, install note.',
  },
  general: {
    title_priority: 'Brand, Product type, Key attribute (the most search-relevant fact), Differentiator. Front-load the product type and the strongest matching attribute.',
    example: { before: 'Magnetisch kader - zilver - A3', after: 'Magnetisch Kader A3 | Zilver | Durable' },
    description_shape: 'Lead with brand + product + product type and the most important spec; then audience/use case, key features, materials, dimensions, color, one concrete benefit.',
  },
};

// Build the compact guidance block injected into the system prompt for one product's catalog_type.
// Falls back to `general` for any unmapped type (matches the worklist's Universal fallback).
export function guidanceBlock(catalogType) {
  const g = GUIDANCE_BY_CATALOG_TYPE[catalogType] || GUIDANCE_BY_CATALOG_TYPE.general;
  return [
    `CATEGORY BEST PRACTICE (${catalogType || 'general'}) — high-converting Shopping guidance:`,
    `  Title attribute priority (front-load earliest, include only what is grounded): ${g.title_priority}`,
    `  Title pattern — before: "${g.example.before}" -> after: "${g.example.after}" (use the product's OWN grounded facts, in its OWN language).`,
    `  Description shape: ${g.description_shape}`,
    `  ${SHARED_DONTS}`,
  ].join('\n');
}
