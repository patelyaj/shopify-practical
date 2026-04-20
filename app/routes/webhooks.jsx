import db from "../db.server";
import { authenticate } from "../shopify.server";

const MAX_ATTEMPTS = 3;

function shopifyOptionsToVariantsJson(options) {
  if (!options || options.length === 0) return {};
  
  const validOptions = options.filter(opt => opt.name !== "Title" || !opt.values.includes("Default Title"));
  
  return Object.fromEntries(
    validOptions.map(opt => [opt.name, opt.values]) // FIXED: Removed .toLowerCase()
  );
}

async function processWebhook(topic, shop, payload) {
  switch (topic) {
    case "PRODUCTS_CREATE":
    case "PRODUCTS_UPDATE": {
      const productId = BigInt(payload.id);
      let safePrice = 0;
      if (payload.variants?.[0]?.price) {
        safePrice = parseFloat(payload.variants[0].price);
        if (isNaN(safePrice)) safePrice = 0;
      }
      const safeSku = payload.variants?.[0]?.sku ?? "";
      const variantsJson = shopifyOptionsToVariantsJson(payload.options);

      await db.product.upsert({
        where: { shopify_product_id: productId },
        update: {
          title: payload.title || "",
          description: payload.body_html || "",
          vendor: payload.vendor || "",
          product_type: payload.product_type || "",
          status: payload.status || "active",
          price: safePrice,
          sku: safeSku,
          variants: variantsJson, 
          updated_at: new Date(payload.updated_at),
          isDeleted: false,
        },
        create: {
          shopify_product_id: productId,
          title: payload.title || "",
          description: payload.body_html || "",
          vendor: payload.vendor || "",
          product_type: payload.product_type || "",
          status: payload.status || "active",
          price: safePrice,
          sku: safeSku,
          variants: variantsJson, 
          created_at: new Date(payload.created_at),
          updated_at: new Date(payload.updated_at),
          isDeleted: false,
        },
      });
      break;
    }

    case "PRODUCTS_DELETE": {
      const productId = BigInt(payload.id);
      await db.product.updateMany({
        where: { shopify_product_id: productId },
        data: { isDeleted: true },
      });
      break;
    }

    case "ORDERS_CREATE":
    case "ORDERS_UPDATED": {
      const orderId = BigInt(payload.id);
      const safeFinancialStatus = (payload.financial_status || "PENDING").toUpperCase();
      const safeFulfillmentStatus = (payload.fulfillment_status || "UNFULFILLED").toUpperCase();

      await db.order.upsert({
        where: { shopify_order_id: orderId },
        create: {
          shopify_order_id: orderId,
          email: payload.email || "",
          total_price: parseFloat(payload.total_price || 0),
          currency: payload.currency || "",
          financial_status: safeFinancialStatus,
          fulfillment_status: safeFulfillmentStatus,
          created_at: new Date(payload.created_at),
          updated_at: new Date(payload.updated_at),
        },
        update: {
          financial_status: safeFinancialStatus,
          fulfillment_status: safeFulfillmentStatus,
          updated_at: new Date(payload.updated_at),
        },
      });
      break;
    }

    case "ORDERS_DELETE": {
      const orderId = BigInt(payload.id);
      await db.order.deleteMany({ where: { shopify_order_id: orderId } });
      break;
    }

    default:
      console.log(`Unhandled webhook topic: ${topic}`);
  }
}

async function processWithRetry(topic, shop, payload) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await processWebhook(topic, shop, payload);
      console.log(`✅ ${topic} succeeded on attempt ${attempt}`);
      return;
    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed for ${topic}:`, err.message);
      if (attempt < MAX_ATTEMPTS) {
        console.log(`Retrying in 2000ms...`);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.error(`🚨 All ${MAX_ATTEMPTS} attempts failed for ${topic} (shop: ${shop})`);
      }
    }
  }
}

export async function action({ request }) {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  processWithRetry(topic, shop, payload).catch((err) => {
    console.error(`Fatal retry error for ${topic}:`, err);
  });
  
  return new Response("Webhook received", { status: 200 });
}