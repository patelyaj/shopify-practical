import { useNavigate } from "react-router";
import {
  Card, Text, Badge, Button, IndexTable,
  Pagination, BlockStack, InlineStack, Box, Tooltip
} from "@shopify/polaris";

export default function ProductTable({
  products,
  page,
  totalPages,
  onStartEditing,
  onDelete,
  onOpenDescription,
  onViewVariants,
  onViewHistory, //  Added prop
}) {
  const navigate = useNavigate();
             
  return (
    <Card padding="0">
      <IndexTable
        resourceName={{ singular: "product", plural: "products" }}
        itemCount={products.length}
        headings={[
          { title: "Product" },
          { title: "Status" },
          { title: "Vendor & Type" },
          { title: "Pricing & Inventory" },
          { title: "Actions", alignment: "end" },
        ]}
        selectable={false}
      >
        {products.map((p) => {
          const descrip = p.description ? p.description.replace(/<[^>]+>/g, "") : "";
          const hasVariants = p.variants && Object.keys(p.variants).length > 0;
          console.log("Product Variants:", p.variants); // Debug log for variants
          console.log("Product Description:", hasVariants); // Debug log for hasVariants


          return (
            <IndexTable.Row id={p.id} key={p.id} position={p.id}>

              {/* PRODUCT */}
              <IndexTable.Cell>
                <BlockStack gap="100">
                  {p.title?.length > 20
                    ? <Tooltip content={p.title}><Text variant="bodyMd" fontWeight="bold" as="span">{p.title.substring(0, 20)}...</Text></Tooltip>
                    : <Text variant="bodyMd" fontWeight="bold" as="span">{p.title}</Text>
                  }
                  {descrip && (
                    <Text variant="bodySm" tone="subdued" as="span">
                      {descrip.length > 20
                        ? <>{descrip.slice(0, 20)}... <Button variant="plain" onClick={() => onOpenDescription(descrip)}>View More</Button></>
                        : descrip
                      }
                    </Text>
                  )}
                </BlockStack>
              </IndexTable.Cell>

              {/* STATUS */}
              <IndexTable.Cell>
                <Badge tone={p.status === "active" ? "success" : "info"}>{p.status || "active"}</Badge>
              </IndexTable.Cell>

              {/* VENDOR & TYPE */}
              <IndexTable.Cell>
                <BlockStack gap="100">
                  {p.vendor?.length > 15
                    ? <Tooltip content={p.vendor}><Text as="span">{p.vendor.substring(0, 15)}...</Text></Tooltip>
                    : <Text as="span">{p.vendor}</Text>
                  }
                  {p.product_type?.length > 15
                    ? <Tooltip content={p.product_type}><Text as="span">{p.product_type.substring(0, 15)}...</Text></Tooltip>
                    : <Text as="span">{p.product_type}</Text>
                  }
                </BlockStack>
              </IndexTable.Cell>

              {/* PRICING & INVENTORY + Variants button */}
              <IndexTable.Cell>
                <BlockStack gap="100">
                  <Text as="span">₹{p.price}</Text>
                  {p.sku?.length > 15
                    ? <Tooltip content={p.sku}><Text as="span">{p.sku.substring(0, 15)}...</Text></Tooltip>
                    : <Text as="span">{p.sku}</Text>
                  }
                  {hasVariants && 
                    <div className="variant-container">
                      <Button style={{ textDecoration: "none" }}
                      onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = "#CCE5FF";
                          e.currentTarget.style.textDecoration = "none";
                        }}
                         variant="plain" size="slim" onClick={() => onViewVariants(p)}>
                        Variants
                      </Button>
                    </div>
                    }
                </BlockStack>
              </IndexTable.Cell>

              {/* ACTIONS */}
              <IndexTable.Cell>
                <InlineStack gap="200" align="end" wrap={false}>
                  <Button onClick={() => onStartEditing(p)}>Edit</Button>
                  <Button tone="critical" onClick={() => onDelete(p.shopify_product_id)}>Delete</Button>
                  <Button onClick={() => onViewHistory(p)}>View History</Button> {/*  Fixed function call */}
                </InlineStack>
              </IndexTable.Cell>

            </IndexTable.Row>
          );
        })}
      </IndexTable>

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