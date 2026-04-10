    import { useState } from "react";
    import { useLoaderData, useSubmit, useNavigate } from "react-router";
    import db from "../db.server";
    import axios from "axios";
    import { authenticate } from "../shopify.server";

    // Import Shopify Polaris Components
    import { 
      Page, Layout, Card, Text, Badge, Button, TextField, Select, 
      IndexTable, Pagination, BlockStack, InlineStack, FormLayout, Box, Modal 
    } from "@shopify/polaris";

    // ==================
    // 1. GET PRODUCTS (Local DB Pagination)
    // ==================
    export async function loader({ request }) {
      await authenticate.admin(request);

      const url = new URL(request.url);
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const itemsPerPage = 10;
      const skip = (page - 1) * itemsPerPage;

      // ONLY count and fetch products that are NOT deleted
      const totalProducts = await db.product.count({
        where: { isDeleted: false }
      });
      
      const totalPages = Math.ceil(totalProducts / itemsPerPage);

      const products = await db.product.findMany({
        where: { isDeleted: false }, // FILTER OUT DELETED
        take: itemsPerPage,
        skip: skip,
        orderBy: { id: "desc" },
      });

      return { products, page, totalPages };
    }

    // ==================
    // 2. MUTATIONS (UI → Shopify → DB)
    // ==================
    // ==================
    // 2. MUTATIONS (UI → Shopify → DB)
    // ==================
    export async function action({ request }) {
      // --- THIS WAS MISSING ---
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
      
      const getVariantData = () => ({
        price: formData.get("price"),
        sku: formData.get("sku"),
      });
      // -------------------------

      // 🔄 FULL RESYNC
      if (type === "full_sync") {
        const response = await axios.get(`https://${shop}/admin/api/2024-01/products.json?limit=250`, { headers });
        for (const p of response.data.products) {
          await db.product.upsert({
            where: { shopify_product_id: p.id },
            update: { 
              title: p.title, 
              description: p.body_html, 
              vendor: p.vendor, 
              product_type: p.product_type, 
              status: p.status, 
              price: parseFloat(p.variants[0]?.price || 0), 
              sku: p.variants[0]?.sku || "", 
              updated_at: new Date(p.updated_at),
              isDeleted: false // Ensure active products aren't accidentally hidden
            },
            create: { 
              shopify_product_id: p.id, 
              title: p.title, 
              description: p.body_html, 
              vendor: p.vendor, 
              product_type: p.product_type, 
              status: p.status, 
              price: parseFloat(p.variants[0]?.price || 0), 
              sku: p.variants[0]?.sku || "", 
              created_at: new Date(p.created_at), 
              updated_at: new Date(p.updated_at),
              isDeleted: false
            },
          });
        }
        return { success: true };
      }

      // ➕ CREATE PRODUCT
      if (type === "create") {
        const response = await axios.post(`https://${shop}/admin/api/2024-01/products.json`, { product: { ...getProductData(), variants: [getVariantData()] } }, { headers });
        const p = response.data.product;
        await db.product.create({
          data: { 
            shopify_product_id: p.id, 
            title: p.title, 
            description: p.body_html, 
            vendor: p.vendor, 
            product_type: p.product_type, 
            status: p.status, 
            price: parseFloat(p.variants[0].price), 
            sku: p.variants[0].sku, 
            created_at: new Date(p.created_at), 
            updated_at: new Date(p.updated_at),
            isDeleted: false 
          },
        });
        return { success: true };
      }

      // ✏️ UPDATE PRODUCT
      if (type === "update") {
        const shopifyId = formData.get("shopify_product_id");
        const getRes = await axios.get(`https://${shop}/admin/api/2024-01/products/${shopifyId}.json`, { headers });
        const variantId = getRes.data.product.variants[0].id;
        await axios.put(`https://${shop}/admin/api/2024-01/products/${shopifyId}.json`, { product: { id: shopifyId, ...getProductData(), variants: [{ id: variantId, ...getVariantData() }] } }, { headers });
        
        await db.product.updateMany({
          where: { shopify_product_id: shopifyId },
          data: { 
            title: formData.get("title"), 
            description: formData.get("description"), 
            vendor: formData.get("vendor"), 
            product_type: formData.get("product_type"), 
            status: formData.get("status"), 
            price: parseFloat(formData.get("price")), 
            sku: formData.get("sku"), 
            updated_at: new Date(),
            isDeleted: false // Re-activate if updated
          },
        });
        return { success: true };
      }

      // 🗑️ DELETE PRODUCT (SOFT DELETE)
      if (type === "delete") {
        const shopifyId = formData.get("shopify_product_id");
        
        // 1. Hard delete from Shopify
        await axios.delete(`https://${shop}/admin/api/2024-01/products/${shopifyId}.json`, { headers });
        
        // 2. SOFT delete from local DB
        await db.product.updateMany({ 
          where: { shopify_product_id: shopifyId },
          data: { isDeleted: true }
        });
        
        return { success: true };
      }

      return null;
    }

    // ==================
    // 3. THE UI (POLARIS)
    // ==================
    export default function ProductsPage() {
      const { products, page, totalPages } = useLoaderData();
      const submit = useSubmit();
      const navigate = useNavigate();

      // STATE: Modal controls
      const [isModalOpen, setIsModalOpen] = useState(false);

      // STATE: For the "Add New Product" Form and Validation
      const [createForm, setCreateForm] = useState({ title: "", description: "", vendor: "", product_type: "", sku: "", price: "", status: "active" });
      const [formErrors, setFormErrors] = useState({});

      const handleCreateChange = (value, id) => {
        setCreateForm(prev => ({ ...prev, [id]: value }));
        // Clear the error for this specific field when the user types
        if (formErrors[id]) {
          setFormErrors(prev => ({ ...prev, [id]: undefined }));
        }
      };

      // STATE: For the Inline "Edit" Form
      const [editingId, setEditingId] = useState(null);
      const [editForm, setEditForm] = useState({});
      const handleEditChange = (value, id) => setEditForm(prev => ({ ...prev, [id]: value }));

      // ACTIONS
      const handleSync = () => {
        if (confirm("Overwrite local DB with fresh Shopify data?")) submit({ type: "full_sync" }, { method: "post" });
      };

      const handleCreate = () => {
        const errors = {};
        
        // 1. Validation Logic
        if (!createForm.title.trim()) {
          errors.title = "Title is required";
        }
        
        if (!createForm.price || parseFloat(createForm.price) <= 0) {
          errors.price = "Price must be greater than 0";
        }

        if (!createForm.vendor.trim()) {
          errors.vendor = "Vendor is required";
        }

        if (!createForm.product_type.trim()) {
          errors.product_type = "Product type is required";
        }

        // 2. Prevent submission if there are errors
        if (Object.keys(errors).length > 0) {
          setFormErrors(errors);
          return; 
        }

        // 3. Submit and Reset
        submit({ type: "create", ...createForm }, { method: "post" });
        setCreateForm({ title: "", description: "", vendor: "", product_type: "", sku: "", price: "", status: "active" }); 
        setFormErrors({}); 
        setIsModalOpen(false); 
      };

      const startEditing = (p) => {
        setEditingId(p.id);
        setEditForm({ ...p, price: p.price.toString() }); 
      };

      const saveEdit = () => {
        submit({ type: "update", shopify_product_id: editForm.shopify_product_id.toString(), ...editForm }, { method: "post" });
        setEditingId(null);
      };

      const handleDelete = (shopifyId) => {
        if (confirm("Delete this product from Shopify and your DB?")) submit({ type: "delete", shopify_product_id: shopifyId.toString() }, { method: "post" });
      };

      const resourceName = { singular: 'product', plural: 'products' };

      return (
        <Page 
          title="Product Manager" 
          primaryAction={{ 
            content: 'Add Product', 
            onAction: () => setIsModalOpen(true) 
          }}
          secondaryActions={[
            { content: 'Sync Data', onAction: handleSync }
          ]}
        >
          <Layout>
            
            {/* 📦 PRODUCT TABLE */}
            <Layout.Section>
              <Card padding="0">
                <IndexTable
                  resourceName={resourceName}
                  itemCount={products.length}
                  headings={[
                    { title: 'Product' },
                    { title: 'Status' },
                    { title: 'Vendor & Type' },
                    { title: 'Pricing & Inventory' },
                    { title: 'Actions', alignment: 'end' },
                  ]}
                  selectable={false}
                >
                  {products.map((p) => {
                    const isEditing = editingId === p.id;

                    return (
                      <IndexTable.Row id={p.id} key={p.id} position={p.id}>
                        {isEditing ? (
                          /* --- EDIT MODE ROW --- */
                          <>
                            <IndexTable.Cell>
                              <BlockStack gap="200">
                                <TextField value={editForm.title} onChange={handleEditChange} id="title" autoComplete="off" placeholder="Title" />
                                <TextField value={editForm.description} onChange={handleEditChange} id="description" autoComplete="off" placeholder="Description" />
                              </BlockStack>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <Select options={[{label: 'Active', value: 'active'}, {label: 'Draft', value: 'draft'}]} value={editForm.status} onChange={handleEditChange} id="status" />
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <BlockStack gap="200">
                                <TextField placeholder="Vendor" value={editForm.vendor} onChange={handleEditChange} id="vendor" autoComplete="off" />
                                <TextField placeholder="Type" value={editForm.product_type} onChange={handleEditChange} id="product_type" autoComplete="off" />
                              </BlockStack>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <BlockStack gap="200">
                                <TextField type="number" prefix="₹" value={editForm.price} onChange={handleEditChange} id="price" autoComplete="off" />
                                <TextField placeholder="SKU" value={editForm.sku} onChange={handleEditChange} id="sku" autoComplete="off" />
                              </BlockStack>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <InlineStack gap="200" align="end" wrap={false}>
                                <Button tone="success" onClick={saveEdit}>Save</Button>
                                <Button onClick={() => setEditingId(null)}>Cancel</Button>
                              </InlineStack>
                            </IndexTable.Cell>
                          </>
                        ) : (
                          /* --- VIEW MODE ROW --- */
                          <>
                            <IndexTable.Cell>
                              <BlockStack gap="100">
                                <Text variant="bodyMd" fontWeight="bold" as="span">{p.title}</Text>
                                {p.description && (
                                  <Text variant="bodySm" tone="subdued" as="span">
                                    {p.description.replace(/<[^>]+>/g, '')}
                                  </Text>
                                )}
                              </BlockStack>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <Badge tone={p.status === 'active' ? 'success' : 'info'}>{p.status || 'active'}</Badge>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <BlockStack gap="100">
                                <Text as="span">{p.vendor || "—"}</Text>
                                <Text variant="bodySm" tone="subdued" as="span">{p.product_type || "—"}</Text>
                              </BlockStack>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <BlockStack gap="100">
                                <Text as="span">₹{p.price}</Text>
                                <Text variant="bodySm" tone="subdued" as="span">SKU: {p.sku || "—"}</Text>
                              </BlockStack>
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <InlineStack gap="200" align="end" wrap={false}>
                                <Button onClick={() => startEditing(p)}>Edit</Button>
                                <Button tone="critical" onClick={() => handleDelete(p.shopify_product_id)}>Delete</Button>
                              </InlineStack>
                            </IndexTable.Cell>
                          </>
                        )}
                      </IndexTable.Row>
                    );
                  })}
                </IndexTable>

                {/* 📄 PAGINATION */}
                {totalPages > 1 && (
                  <Box padding="400">
                    <InlineStack align="center">
                      <Pagination
                        hasPrevious={page > 1}
                        onPrevious={() => navigate(`?page=${page - 1}`)}
                        hasNext={page < totalPages}
                        onNext={() => navigate(`?page=${page + 1}`)}
                        label={`Page ${page} of ${totalPages}`}
                      />
                    </InlineStack>
                  </Box>
                )}
              </Card>
            </Layout.Section>
          </Layout>

          {/* 🚀 MODAL POPUP FOR ADDING PRODUCTS WITH VALIDATION */}
          <Modal
            open={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setFormErrors({}); // Clear errors if the user cancels
            }}
            title="Create New Product"
            primaryAction={{
              content: 'Save Product',
              onAction: handleCreate,
            }}
            secondaryActions={[
              {
                content: 'Cancel',
                onAction: () => {
                  setIsModalOpen(false);
                  setFormErrors({});
                },
              },
            ]}
          >
            <Modal.Section>
              <FormLayout>
                <FormLayout.Group>
                  <TextField 
                    label="Title" 
                    value={createForm.title} 
                    onChange={handleCreateChange} 
                    id="title" 
                    autoComplete="off" 
                    requiredIndicator 
                    error={formErrors.title} 
                  />
                  <TextField 
                    label="Price (₹)" 
                    type="number" 
                    value={createForm.price} 
                    onChange={handleCreateChange} 
                    id="price" 
                    autoComplete="off" 
                    requiredIndicator 
                    min={1} 
                    error={formErrors.price} 
                  />
                </FormLayout.Group>
                
                <TextField 
                  label="Description" 
                  value={createForm.description} 
                  onChange={handleCreateChange} 
                  id="description" 
                  multiline={3} 
                  autoComplete="off"  
                />
                
                <FormLayout.Group>
                  <TextField 
                    label="Vendor" 
                    value={createForm.vendor} 
                    onChange={handleCreateChange} 
                    id="vendor" 
                    autoComplete="off" 
                    requiredIndicator 
                    error={formErrors.vendor} 
                  />
                  <TextField 
                    label="Product Type" 
                    value={createForm.product_type} 
                    onChange={handleCreateChange} 
                    id="product_type" 
                    autoComplete="off" 
                    error={formErrors.product_type}
                  />
                </FormLayout.Group>
                
                <FormLayout.Group>
                  <TextField 
                    label="SKU" 
                    value={createForm.sku} 
                    onChange={handleCreateChange} 
                    id="sku" 
                    autoComplete="off" 
                  />
                  <Select 
                    label="Status" 
                    options={[{label: 'Active', value: 'active'}, {label: 'Draft', value: 'draft'}]} 
                    value={createForm.status} 
                    onChange={handleCreateChange} 
                    id="status" 
                  />
                </FormLayout.Group>
              </FormLayout>
            </Modal.Section>
          </Modal>

        </Page>
      );
    }