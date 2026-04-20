import { useState, useEffect } from "react";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import db from "../db.server";
import axios from "axios";
import { authenticate } from "../shopify.server";
import { Page, Layout, Spinner, Frame, Toast, Modal, Text, BlockStack, InlineStack } from "@shopify/polaris";

import ProductModal from "../components/ProductModal";
import ProductTable from "../components/ProductTable";
import DescriptionModal from "../components/DescriptionModal";

// ── HELPERS ──────────────────────────────────────────────────────────────────

function variantsJsonToShopifyOptions(variantsJson) {
  if (!variantsJson || Object.keys(variantsJson).length === 0) {
    return [{ name: "Title" }];
  }
  // Shopify max 3 options — slice to be safe
  return Object.entries(variantsJson).slice(0, 3).map(([name, values], i) => ({
    name,
    position: i + 1,
    values,
  }));
}

function buildShopifyVariants(variantsJson, price, sku) {
  if (!variantsJson || Object.keys(variantsJson).length === 0) {
    return [{ price, sku, option1: "Default Title", option2: null, option3: null }];
  }

  // Shopify max 3 options — slice to be safe
  const optionEntries = Object.entries(variantsJson).slice(0, 3);
  const optionValues = optionEntries.map(([, vals]) => vals);

  const combinations = optionValues.reduce(
    (acc, vals) => acc.flatMap(combo => vals.map(val => [...combo, val])),
    [[]]
  );

  return combinations.map(combo => {
    const variant = { price, sku };
    combo.forEach((val, i) => { variant[`option${i + 1}`] = val; });
    for (let i = combo.length + 1; i <= 3; i++) {
      variant[`option${i}`] = null;
    }
    return variant;
  });
}

// ── LOADER ───────────────────────────────────────────────────────────────────
export async function loader({ request }) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const itemsPerPage = 10;
  const skip = (page - 1) * itemsPerPage;

  const totalProducts = await db.product.count({ where: { isDeleted: false } });
  const products = await db.product.findMany({
    where: { isDeleted: false },
    take: itemsPerPage, skip, orderBy: { id: "desc" },
  });

  return { products, page, totalPages: Math.ceil(totalProducts / itemsPerPage) };
}

// ── ACTION ───────────────────────────────────────────────────────────────────
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const { shop, accessToken } = session;
  const formData = await request.formData();
  const type = formData.get("type");
  const headers = { "X-Shopify-Access-Token": accessToken };

  const getProductData = () => ({
    title: formData.get("title"),
    body_html: formData.get("description"),
    vendor: formData.get("vendor"),
    product_type: formData.get("product_type"),
    status: formData.get("status") || "active",
  });

  const variantsRaw = formData.get("variants");
  let variantsJson = undefined;
  if (variantsRaw) {
    try { variantsJson = JSON.parse(variantsRaw); } catch (e) {
      console.log("variants parse error", e);
    }
  }

  const price = formData.get("price");
  const sku = formData.get("sku");

  // ── FULL SYNC ──
  if (type === "full_sync") {
    try {
      const res = await axios.get(`https://${shop}/admin/api/2024-01/products.json?limit=250`, { headers });
      for (const p of res.data.products) {
        const syncedVariants = p.options
          ? Object.fromEntries(
              p.options
                .filter(opt => opt.name !== "Title" || !opt.values.includes("Default Title"))
                .map(opt => [opt.name, opt.values])
            )
          : {};

        await db.product.upsert({
          where: { shopify_product_id: p.id },
          update: {
            title: p.title, description: p.body_html, vendor: p.vendor,
            product_type: p.product_type, status: p.status,
            price: parseFloat(p.variants[0]?.price || 0),
            sku: p.variants[0]?.sku || "",
            variants: syncedVariants,
            updated_at: new Date(p.updated_at), isDeleted: false,
          },
          create: {
            shopify_product_id: p.id, title: p.title, description: p.body_html,
            vendor: p.vendor, product_type: p.product_type, status: p.status,
            price: parseFloat(p.variants[0]?.price || 0),
            sku: p.variants[0]?.sku || "",
            variants: syncedVariants,
            created_at: new Date(p.created_at), updated_at: new Date(p.updated_at),
            isDeleted: false, history: [],
          },
        });
      }
      return { success: true, message: "Data synced successfully!", isError: false };
    } catch {
      return { success: false, message: "Failed to sync products.", isError: true };
    }
  }

  // ── CREATE ──
  if (type === "create") {
    try {
      const shopifyOptions = variantsJsonToShopifyOptions(variantsJson);
      const shopifyVariants = buildShopifyVariants(variantsJson, price, sku);

      const res = await axios.post(
        `https://${shop}/admin/api/2024-01/products.json`,
        {
          product: {
            ...getProductData(),
            options: shopifyOptions,
            variants: shopifyVariants,
          }
        },
        { headers }
      );

      const p = res.data.product;
      let dbSuccess = true;
      try {
        await db.product.create({
          data: {
            shopify_product_id: p.id, title: p.title, description: p.body_html,
            vendor: p.vendor, product_type: p.product_type, status: p.status,
            price: parseFloat(p.variants[0].price), sku: p.variants[0].sku,
            created_at: new Date(p.created_at), updated_at: new Date(p.updated_at),
            isDeleted: false,
            variants: variantsJson ?? null,
            history: [{ date: new Date().toISOString(), changes: ["Product created"] }],
          },
        });
      } catch { dbSuccess = false; }

      return {
        success: true,
        message: dbSuccess ? "Product created!" : "Saved to Shopify, syncing DB...",
        isError: false,
      };
    } catch {
      return { success: false, message: "Failed to create product.", isError: true };
    }
  }

  // ── UPDATE ──
  if (type === "update") {
    try {
      const shopifyId = formData.get("shopify_product_id");
      const existingProduct = await db.product.findFirst({
        where: { shopify_product_id: BigInt(shopifyId) }
      });

      // 1. Fetch current Shopify product to get existing variant IDs
      const getRes = await axios.get(
        `https://${shop}/admin/api/2024-01/products/${shopifyId}.json`,
        { headers }
      );
      const existingShopifyVariants = getRes.data.product.variants;

      const shopifyOptions = variantsJsonToShopifyOptions(variantsJson);
      const shopifyVariants = buildShopifyVariants(variantsJson, price, sku);

      // 2. DELETE orphaned variants individually BEFORE updating the product
      //    The REST API does not reliably support _destroy on variants during a PUT.
      if (existingShopifyVariants.length > shopifyVariants.length) {
        const variantsToDelete = existingShopifyVariants.slice(shopifyVariants.length);
        await Promise.all(
          variantsToDelete.map(v =>
            axios.delete(
              `https://${shop}/admin/api/2024-01/products/${shopifyId}/variants/${v.id}.json`,
              { headers }
            ).catch(err => {
              // Log but don't throw — best-effort deletion
              console.warn(`Could not delete variant ${v.id}:`, err.response?.data || err.message);
            })
          )
        );
      }

      // 3. Merge IDs into new variants so Shopify updates instead of creating duplicates
      const mergedVariants = shopifyVariants.map((v, i) => ({
        ...v,
        ...(existingShopifyVariants[i] ? { id: existingShopifyVariants[i].id } : {}),
      }));

      // 4. PUT the updated product
      await axios.put(
        `https://${shop}/admin/api/2024-01/products/${shopifyId}.json`,
        {
          product: {
            id: shopifyId,
            ...getProductData(),
            options: shopifyOptions,
            variants: mergedVariants,
          }
        },
        { headers }
      );

      // 5. Update local DB
      let dbSuccess = true;
      try {
        const updateData = {
          title: formData.get("title"),
          description: formData.get("description"),
          vendor: formData.get("vendor"),
          product_type: formData.get("product_type"),
          status: formData.get("status"),
          price: parseFloat(price),
          sku: sku,
          updated_at: new Date(),
          isDeleted: false,
          ...(variantsJson !== undefined && { variants: variantsJson }),
        };

        if (existingProduct) {
          const changes = [];
          if (existingProduct.title !== updateData.title) changes.push(`Title: "${existingProduct.title}" → "${updateData.title}"`);
          if (existingProduct.price !== updateData.price) changes.push(`Price: Rs.${existingProduct.price} → Rs.${updateData.price}`);
          if (existingProduct.status !== updateData.status) changes.push(`Status: ${existingProduct.status} → ${updateData.status}`);
          if (existingProduct.sku !== updateData.sku) changes.push(`SKU: "${existingProduct.sku}" → "${updateData.sku}"`);
          if (existingProduct.vendor !== updateData.vendor) changes.push(`Vendor: "${existingProduct.vendor}" → "${updateData.vendor}"`);
          if (changes.length === 0) changes.push("Details or variants updated");

          let currentHistory = existingProduct.history || [];
          if (!Array.isArray(currentHistory)) currentHistory = [];
          updateData.history = [
            { date: new Date().toISOString(), changes },
            ...currentHistory,
          ].slice(0, 5);
        }

        await db.product.updateMany({
          where: { shopify_product_id: shopifyId },
          data: updateData,
        });
      } catch { dbSuccess = false; }

      return {
        success: true,
        message: dbSuccess ? "Product updated!" : "Updated in Shopify, syncing DB...",
        isError: false,
      };
    } catch (err) {
      console.error("Update error:", err.response?.data || err.message);
      return { success: false, message: "Failed to update product.", isError: true };
    }
  }

  // ── DELETE ──
  if (type === "delete") {
    try {
      const shopifyId = formData.get("shopify_product_id");
      await axios.delete(`https://${shop}/admin/api/2024-01/products/${shopifyId}.json`, { headers });
      let dbSuccess = true;
      try {
        await db.product.updateMany({
          where: { shopify_product_id: shopifyId },
          data: { isDeleted: true },
        });
      } catch { dbSuccess = false; }
      return {
        success: true,
        message: dbSuccess ? "Product deleted!" : "Deleted from Shopify, syncing...",
        isError: false,
      };
    } catch {
      return { success: false, message: "Failed to delete product.", isError: true };
    }
  }

  return null;
}

// ── UI ───────────────────────────────────────────────────────────────────────
export default function IndexPage() {
  const { products, page, totalPages } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData();

  const isSubmitting = navigation.state === "submitting" || navigation.state === "loading";

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [productModal, setProductModal] = useState({ isOpen: false, initialData: null });
  const [descModalData, setDescModalData] = useState({ isOpen: false, text: "" });
  const [variantsModal, setVariantsModal] = useState({ isOpen: false, productTitle: "", variants: null });
  const [historyModal, setHistoryModal] = useState({ isOpen: false, productTitle: "", history: null });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, shopifyId: null });

  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastIsError, setToastIsError] = useState(false);

  useEffect(() => {
    if (actionData?.message) {
      setToastMessage(actionData.message);
      setToastIsError(actionData.isError || false);
      setToastActive(true);
    }
  }, [actionData]);

  const openCreateModal = () => setProductModal({ isOpen: true, initialData: null });
  const openEditModal = (product) => setProductModal({ isOpen: true, initialData: product });
  const closeProductModal = () => setProductModal({ isOpen: false, initialData: null });

  const handleDeleteClick = (shopifyId) => {
    setDeleteModal({ isOpen: true, shopifyId: shopifyId.toString() });
  };

  const confirmDelete = () => {
    submit({ type: "delete", shopify_product_id: deleteModal.shopifyId }, { method: "post" });
    setDeleteModal({ isOpen: false, shopifyId: null });
  };

  return (
    <Frame>
      {isSubmitting && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(255,255,255,0.7)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <Spinner accessibilityLabel="Loading..." size="large" />
        </div>
      )}

      <Page
        title="Product List"
        primaryAction={{ content: "Add Product", onAction: openCreateModal }}
        secondaryActions={[{ content: "Sync Data", onAction: () => setIsSyncModalOpen(true) }]}
      >
        <Layout>
          <Layout.Section>
            <ProductTable
              products={products}
              page={page}
              totalPages={totalPages}
              onStartEditing={openEditModal}
              onDelete={handleDeleteClick}
              onOpenDescription={(text) => setDescModalData({ isOpen: true, text })}
              onViewVariants={(p) => setVariantsModal({ isOpen: true, productTitle: p.title, variants: p.variants })}
              onViewHistory={(p) => setHistoryModal({ isOpen: true, productTitle: p.title, history: p.history })}
            />
          </Layout.Section>
        </Layout>

        <ProductModal
          isOpen={productModal.isOpen}
          onClose={closeProductModal}
          isSubmitting={isSubmitting}
          initialData={productModal.initialData}
        />

        <DescriptionModal
          isOpen={descModalData.isOpen}
          onClose={() => setDescModalData({ isOpen: false, text: "" })}
          description={descModalData.text}
        />

        <Modal
          open={isSyncModalOpen}
          onClose={() => setIsSyncModalOpen(false)}
          title="Sync Data with Shopify"
          primaryAction={{
            content: "Sync",
            onAction: () => { submit({ type: "full_sync" }, { method: "post" }); setIsSyncModalOpen(false); }
          }}
          secondaryActions={[{ content: "Cancel", onAction: () => setIsSyncModalOpen(false) }]}
        >
          <Modal.Section>
            <p>This will overwrite your local DB with fresh data from Shopify.</p>
          </Modal.Section>
        </Modal>

        <Modal
          open={deleteModal.isOpen}
          onClose={() => setDeleteModal({ isOpen: false, shopifyId: null })}
          title="Delete Product"
          primaryAction={{
            content: "Delete",
            destructive: true,
            onAction: confirmDelete,
            loading: isSubmitting
          }}
          secondaryActions={[{
            content: "Cancel",
            onAction: () => setDeleteModal({ isOpen: false, shopifyId: null }),
            disabled: isSubmitting
          }]}
        >
          <Modal.Section>
            <Text as="p">
              Are you sure you want to delete this product? This action cannot be undone and will remove the product from both your database and Shopify.
            </Text>
          </Modal.Section>
        </Modal>

        <Modal
          open={variantsModal.isOpen}
          onClose={() => setVariantsModal({ isOpen: false, productTitle: "", variants: null })}
          title={`Variants - ${variantsModal.productTitle}`}
          primaryAction={{ content: "Close", onAction: () => setVariantsModal({ isOpen: false, productTitle: "", variants: null }) }}
        >
          <Modal.Section>
            <BlockStack gap="300">
              {variantsModal.variants && Object.keys(variantsModal.variants).length > 0
                ? Object.entries(variantsModal.variants).sort().map(([key, values]) => (
                  <div key={key} style={{ padding: "8px" }}>
                    <div style={{ marginBottom: "8px" }}>
                      <Text variant="headingSm" as="h4">{key}</Text>
                    </div>
                    <InlineStack gap="200" wrap>
                      {(Array.isArray(values) ? values : [values]).map((val, idx) => (
                        <div key={idx} style={{ backgroundColor: "#F1F2F4", border: "1px solid #D5D9D9", borderRadius: "4px", padding: "2px 8px", fontSize: "13px", color: "#202223" }}>
                          {val}
                        </div>
                      ))}
                    </InlineStack>
                  </div>
                ))
                : <Text tone="subdued">No variants for this product.</Text>
              }
            </BlockStack>
          </Modal.Section>
        </Modal>

        <Modal
          open={historyModal.isOpen}
          onClose={() => setHistoryModal({ isOpen: false, productTitle: "", history: null })}
          title={`Recent Changes - ${historyModal.productTitle}`}
          primaryAction={{ content: "Close", onAction: () => setHistoryModal({ isOpen: false, productTitle: "", history: null }) }}
        >
          <Modal.Section>
            {historyModal.history && historyModal.history.length > 0 ? (
              <BlockStack gap="400">
                {historyModal.history.map((entry, idx) => (
                  <div key={idx} style={{ paddingBottom: "12px", borderBottom: idx !== historyModal.history.length - 1 ? "1px solid #E1E3E5" : "none" }}>
                    <Text variant="headingSm" as="h6">{new Date(entry.date).toLocaleString()}</Text>
                    <ul style={{ margin: "8px 0 0 16px", padding: 0, color: "#202223", fontSize: "13px" }}>
                      {entry.changes.map((change, i) => <li key={i}>{change}</li>)}
                    </ul>
                  </div>
                ))}
              </BlockStack>
            ) : (
              <Text tone="subdued">No changes recorded yet.</Text>
            )}
          </Modal.Section>
        </Modal>

      </Page>

      {toastActive && (
        <Toast content={toastMessage} error={toastIsError} onDismiss={() => setToastActive(false)} duration={5000} />
      )}
    </Frame>
  );
}