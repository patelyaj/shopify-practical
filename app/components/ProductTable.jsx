import { useNavigate } from "react-router";
import { 
  Card, Text, Badge, Button, TextField, Select, 
  IndexTable, Pagination, BlockStack, InlineStack, Box, Tooltip 
} from "@shopify/polaris";

export default function ProductTable({
  products,
  page,
  totalPages,
  editingId,
  editForm,
  editFormErrors,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onStartEditing,
  onDelete,
  onOpenDescription
}) {
  const navigate = useNavigate();

  return (
    <Card padding="0">
      <IndexTable
        resourceName={{ singular: 'product', plural: 'products' }}
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
          const descrip = p.description ? p.description.replace(/<[^>]+>/g, '') : "";

          return (
            <IndexTable.Row id={p.id} key={p.id} position={p.id}>
              {isEditing ? (
                /* --- EDIT ROW --- */
                <>
                  <IndexTable.Cell>
                    <BlockStack gap="200">
                      <TextField value={editForm.title} onChange={onEditChange} id="title" autoComplete="off" placeholder="Title" error={editFormErrors.title} />
                      <TextField value={editForm.description} onChange={onEditChange} id="description" autoComplete="off" placeholder="Description" />
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Select options={[{label: 'Active', value: 'active'}, {label: 'Draft', value: 'draft'}]} value={editForm.status} onChange={onEditChange} id="status" />
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <BlockStack gap="200">
                      <TextField placeholder="Vendor" value={editForm.vendor} onChange={onEditChange} id="vendor" autoComplete="off" error={editFormErrors.vendor} />
                      <TextField placeholder="Type" value={editForm.product_type} onChange={onEditChange} id="product_type" autoComplete="off" error={editFormErrors.product_type} />
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <BlockStack gap="200">
                      <TextField type="number" prefix="₹" value={editForm.price} onChange={onEditChange} id="price" autoComplete="off" error={editFormErrors.price} />
                      <TextField placeholder="SKU" value={editForm.sku} onChange={onEditChange} id="sku" autoComplete="off" />
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="200" align="end" wrap={false}>
                      <Button tone="success" onClick={onSaveEdit}>Save</Button>
                      <Button onClick={onCancelEdit}>Cancel</Button>
                    </InlineStack>
                  </IndexTable.Cell>
                </>
              ) : (
                /* --- VIEW ROW --- */
                <>
                  <IndexTable.Cell>
                    <BlockStack gap="100">
                      {p.title?.length > 15 ? (
                        <Tooltip content={p.title}><Text variant="bodyMd" fontWeight="bold" as="span">{p.title.substring(0,15)}...</Text></Tooltip>
                      ) : (<Text variant="bodyMd" fontWeight="bold" as="span">{p.title}</Text>)}
                      
                      {descrip && (
                        <Text variant="bodySm" tone="subdued" as="span">
                          {descrip.length > 15 ? (
                            <>{descrip.slice(0, 15)}... <Button variant="plain" onClick={() => onOpenDescription(descrip)}>View More</Button></>
                          ) : (descrip)}
                        </Text>
                      )}
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={p.status === 'active' ? 'success' : 'info'}>{p.status || 'active'}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <BlockStack gap="100">
                      {p.vendor?.length > 15 ? (<Tooltip content={p.vendor}><Text as="span">{p.vendor.substring(0,15)}...</Text></Tooltip>) : (<Text as="span">{p.vendor}</Text>)}
                      {p.product_type?.length > 15 ? (<Tooltip content={p.product_type}><Text as="span">{p.product_type.substring(0,15)}...</Text></Tooltip>) : (<Text as="span">{p.product_type}</Text>)}
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <BlockStack gap="100">
                      <Text as="span">₹{p.price}</Text>
                      {p.sku?.length > 15 ? (<Tooltip content={p.sku}><Text as="span">{p.sku.substring(0,15)}...</Text></Tooltip>) : (<Text as="span">{p.sku}</Text>)}
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="200" align="end" wrap={false}>
                      <Button onClick={() => onStartEditing(p)}>Edit</Button>
                      <Button tone="critical" onClick={() => onDelete(p.shopify_product_id)}>Delete</Button>
                    </InlineStack>
                  </IndexTable.Cell>
                </>
              )}
            </IndexTable.Row>
          );
        })}
      </IndexTable>

      {/* PAGINATION */}
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
  );
}