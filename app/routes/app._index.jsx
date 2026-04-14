import { useState, useEffect } from "react";
import { useLoaderData, useSubmit, useNavigation , useActionData} from "react-router";
import db from "../db.server";
import axios from "axios";
import { authenticate } from "../shopify.server";
import { Page, Layout, Spinner, Frame, Toast } from "@shopify/polaris";

import CreateProductModal from "../components/CreateProductModal";
import DescriptionModal from "../components/DescriptionModal";
import ProductTable from "../components/ProductTable";

// ==================
// 1. LOADER & ACTION
// ==================
export async function loader({ request }) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const itemsPerPage = 10;
  const skip = (page - 1) * itemsPerPage;

  const totalProducts = await db.product.count({ where: { isDeleted: false } });
  const totalPages = Math.ceil(totalProducts / itemsPerPage);

  const products = await db.product.findMany({
    where: { isDeleted: false }, 
    take: itemsPerPage, skip: skip, orderBy: { id: "desc" },
  });

  return { products, page, totalPages };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const { shop, accessToken } = session;
  const formData = await request.formData();
  const type = formData.get("type");
  const headers = { "X-Shopify-Access-Token": accessToken };

  const getProductData = () => ({
    title: formData.get("title"), body_html: formData.get("description"),
    vendor: formData.get("vendor"), product_type: formData.get("product_type"),
    status: formData.get("status") || "active",
  });
  
  const getVariantData = () => ({ price: formData.get("price"), sku: formData.get("sku") });

  if (type === "full_sync") {
    try {
      const response = await axios.get(`https://${shop}/admin/api/2024-01/products.json?limit=250`, { headers });
      for (const p of response.data.products) {
        await db.product.upsert({
          where: { shopify_product_id: p.id },
          update: { 
            title: p.title, description: p.body_html, vendor: p.vendor, product_type: p.product_type, 
            status: p.status, price: parseFloat(p.variants[0]?.price || 0), sku: p.variants[0]?.sku || "", 
            updated_at: new Date(p.updated_at), isDeleted: false 
          },
          create: { 
            shopify_product_id: p.id, title: p.title, description: p.body_html, vendor: p.vendor, 
            product_type: p.product_type, status: p.status, price: parseFloat(p.variants[0]?.price || 0), 
            sku: p.variants[0]?.sku || "", created_at: new Date(p.created_at), updated_at: new Date(p.updated_at), isDeleted: false
          },
        });
      }
      return { success: true };
    } catch (error) {
      console.error("Full Sync Error:", error.response?.data || error.message);
      return { success: false, error: "Failed to sync products from Shopify." };
    }
  }

  if (type === "create") {
    try {
      const response = await axios.post(`https://${shop}/admin/api/2024-01/products.json`, { product: { ...getProductData(), variants: [getVariantData()] } }, { headers });
      const p = response.data.product;
      let dbSuccess = true; 
      // main thing to do if shopify pass and db fails than the message user should see
      try {
        await db.product.create({
          data: { 
            shopify_product_id: p.id, title: p.title, description: p.body_html, vendor: p.vendor, 
            product_type: p.product_type, status: p.status, price: parseFloat(p.variants[0].price), 
            sku: p.variants[0].sku, created_at: new Date(p.created_at), updated_at: new Date(p.updated_at), isDeleted: false 
          },
        });
      } catch (dbErr) {
        dbSuccess = false;
        console.log("Optimistic local DB write skipped, relying on Webhook.");
      }
      
      return { 
        success: true, 
        message: dbSuccess 
          ? "Product created successfully!" 
          : "Product saved to Shopify but will take a few mins to appear here. If it doesn't, try syncing the data again.",
        isError: false
      };
    } catch (error) {
      console.error("Create Product Error:", error.response?.data || error.message);
      return { success: false, error: "Failed to create product." };
    }
  }

  if (type === "update") {
    try {
      const shopifyId = formData.get("shopify_product_id");
      const getRes = await axios.get(`https://${shop}/admin/api/2024-01/products/${shopifyId}.json`, { headers });
      const variantId = getRes.data.product.variants[0].id;
      
      await axios.put(`https://${shop}/admin/api/2024-01/products/${shopifyId}.json`, { product: { id: shopifyId, ...getProductData(), variants: [{ id: variantId, ...getVariantData() }] } }, { headers });
      // main thing to do if shopify pass and db fails than the message user should see
      let dbSuccess = true;
      
      try {
        await db.product.updateMany({
          where: { shopify_product_id: shopifyId },
          data: { 
            title: formData.get("title"), description: formData.get("description"), vendor: formData.get("vendor"), 
            product_type: formData.get("product_type"), status: formData.get("status"), price: parseFloat(formData.get("price")), 
            sku: formData.get("sku"), updated_at: new Date(), isDeleted: false
          },
        });
      } catch (dbErr) {
        console.log("Optimistic local DB update skipped, relying on Webhook.");
        dbSuccess = false;
      }
      
      return { 
        success: true, 
        message: dbSuccess 
          ? "Product updated successfully!" 
          : "Product updated in Shopify but will take a few mins to appear here. If it doesn't, try syncing the data again.",
        isError: false
      };
    } catch (error) {
      console.error("Update Product Error:", error.response?.data || error.message);
      return { success: false, error: "Failed to update product." };
    }
  }

  if (type === "delete") {
    try {
      const shopifyId = formData.get("shopify_product_id");
      await axios.delete(`https://${shop}/admin/api/2024-01/products/${shopifyId}.json`, { headers });
      // main thing to do if shopify pass and db fails than the message user should see
      let dbSuccess = true;
      
      try {
        await db.product.updateMany({ where: { shopify_product_id: shopifyId }, data: { isDeleted: true } });
      } catch (dbErr) {
        dbSuccess = false;
      }
      
      return { 
        success: true, 
        message: dbSuccess 
          ? "Product deleted successfully!" 
          : "Product deleted from Shopify but will take a few mins to disappear here. If it doesn't, try syncing the data again.",
        isError: false
      };
    } catch (error) {
      console.error("Delete Product Error:", error.response?.data || error.message);
      return { success: false, error: "Failed to delete product." };
    }
  }

  return null;
}
// ==================
// 2. THE UI 
// ==================
export default function IndexPage() {
  const { products, page, totalPages } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const actionData = useActionData();

  const isSubmitting = navigation.state === "submitting" || navigation.state === "loading";

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [descModalData, setDescModalData] = useState({ isOpen: false, text: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editFormErrors, setEditFormErrors] = useState({}); 

  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastIsError, setToastIsError] = useState(false);

  useEffect(() => {
    if (actionData && actionData.message) {
      setToastMessage(actionData.message);
      setToastIsError(actionData.isError || false);
      setToastActive(true);
    }
  }, [actionData]);

  const toggleToast = () => setToastActive((active) => !active);

  const toastMarkup = toastActive ? (
    <Toast content={toastMessage} error={toastIsError} onDismiss={toggleToast} duration={5000} />
  ) : null;

  const handleEditChange = (value, id) => {
    setEditForm(prev => ({ ...prev, [id]: value }));
    if (editFormErrors[id]) setEditFormErrors(prev => ({ ...prev, [id]: undefined }));
  };

  const handleSync = () => {
    if (confirm("Overwrite local DB with fresh Shopify data?")) submit({ type: "full_sync" }, { method: "post" });
  };

  const startEditing = (p) => {
    setEditingId(p.id);
    setEditForm({ ...p, price: p.price ? p.price.toString() : "0" }); 
    setEditFormErrors({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFormErrors({});
  };

  const saveEdit = () => {
    const errors = {};
    if (!editForm.title?.trim()) errors.title = "Required";

// Check if price is strictly numbers (rejects e, E, +, -, .)
    if (!editForm.price || !/^\d+$/.test(editForm.price.toString())) {
      errors.price = "Only numeric or numbers are allowed";
    } else if (parseFloat(editForm.price) <= 0) {
      errors.price = "Price must be > 0";
    }    

    if (!editForm.vendor?.trim()) errors.vendor = "Required";
    if (!editForm.product_type?.trim()) errors.product_type = "Required";

    if (Object.keys(errors).length > 0) return setEditFormErrors(errors);

    submit({ type: "update", shopify_product_id: editForm.shopify_product_id.toString(), ...editForm }, { method: "post" });
    setEditingId(null);
    setEditFormErrors({});
  };

  const handleDelete = (shopifyId) => {
    if (confirm("Delete this product from Shopify and your DB?")) submit({ type: "delete", shopify_product_id: shopifyId.toString() }, { method: "post" });
  };

  return (
    <Frame>
      {/* spinner overlay */}
      {isSubmitting && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <Spinner accessibilityLabel="Loading..." size="large" />
        </div>
      )}

      <Page 
        title="Product List" 
        primaryAction={{ content: 'Add Product', onAction: () => setIsCreateModalOpen(true) }}
        secondaryActions={[{ content: 'Sync Data', onAction: handleSync }]}
      >
        <Layout>
          <Layout.Section>
            <ProductTable 
              products={products}
              page={page}
              totalPages={totalPages}
              editingId={editingId}
              editForm={editForm}
              editFormErrors={editFormErrors}
              onEditChange={handleEditChange}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
              onStartEditing={startEditing}
              onDelete={handleDelete}
              onOpenDescription={(text) => setDescModalData({ isOpen: true, text })}
            />
          </Layout.Section>
        </Layout>

        <CreateProductModal 
          isOpen={isCreateModalOpen} 
          onClose={() => setIsCreateModalOpen(false)} 
          isSubmitting={isSubmitting} 
        />
        
        <DescriptionModal 
          isOpen={descModalData.isOpen} 
          onClose={() => setDescModalData({ isOpen: false, text: "" })} 
          description={descModalData.text} 
        />
      </Page>
      {toastMarkup}
    </Frame>
  );
}