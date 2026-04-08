// routes/webhooks.jsx
import db from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  // 1. Authenticate the webhook
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}. Product ID: ${payload.id}`);

  try {
    switch (topic) {
      case "PRODUCTS_CREATE":
      case "PRODUCTS_UPDATE":
        await db.product.upsert({
          where: { shopify_product_id: payload.id },
          update: {
            title: payload.title,
            description: payload.body_html, // Shopify sends description as body_html
            vendor: payload.vendor,
            product_type: payload.product_type,
            status: payload.status,
            price: parseFloat(payload.variants[0]?.price || 0),
            sku: payload.variants[0]?.sku || "",
            updated_at: new Date(payload.updated_at),
          },
          create: {
            shopify_product_id: payload.id,
            title: payload.title,
            description: payload.body_html,
            vendor: payload.vendor,
            product_type: payload.product_type,
            status: payload.status,
            price: parseFloat(payload.variants[0]?.price || 0),
            sku: payload.variants[0]?.sku || "",
            created_at: new Date(payload.created_at),
            updated_at: new Date(payload.updated_at),
          },
        });
        break;

      case "PRODUCTS_DELETE":
        await db.product.deleteMany({
          where: { shopify_product_id: payload.id },
        });
        break;

      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }

    return new Response("Webhook processed", { status: 200 });

  } catch (error) {
    console.error(`Error processing ${topic} webhook:`, error);
    return new Response("Webhook failed", { status: 500 });
  }
}