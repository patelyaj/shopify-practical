import { useLoaderData, useSubmit } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { Page, Layout, Card, IndexTable, Text, Badge } from "@shopify/polaris";

// 1. ACTION: Fetches from Shopify and puts them in your DB
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Fetch the orders from Shopify
  const response = await admin.graphql(
    `#graphql
    query getOrders {
      orders(first: 50, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            email
            createdAt
            updatedAt
            displayFinancialStatus
            displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
          }
        }
      }
    }`
  );

  const parsedResponse = await response.json();
  const ordersData = parsedResponse.data.orders.edges;

  // Put them into your Prisma database
  for (const edge of ordersData) {
    const order = edge.node;
    const numericId = order.id.match(/\d+$/)[0];

    await db.order.upsert({
      where: { shopify_order_id: BigInt(numericId) },
      create: {
        shopify_order_id: BigInt(numericId),
        email: order.email,
        total_price: parseFloat(order.totalPriceSet.shopMoney.amount),
        currency: order.totalPriceSet.shopMoney.currencyCode,
        financial_status: order.displayFinancialStatus,
        fulfillment_status: order.displayFulfillmentStatus,
        created_at: new Date(order.createdAt),
        updated_at: new Date(order.updatedAt),
      },
      update: {
        financial_status: order.displayFinancialStatus,
        fulfillment_status: order.displayFulfillmentStatus,
      }
    });
  }

  return { success: true };
};

// 2. LOADER: Reads the orders from your DB to show on the screen
export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const dbOrders = await db.order.findMany({
    orderBy: { created_at: "desc" },
  });

  const serializedOrders = dbOrders.map((order) => ({
    ...order,
    shopify_order_id: order.shopify_order_id.toString(),
  }));

  return { orders: serializedOrders };
};

// 3. UI: Displays the data and the Fetch button
export default function OrdersPage() {
  const { orders } = useLoaderData();
  const submit = useSubmit();

  const handleFetchOrders = () => {
    submit({}, { method: "post" });
  };

 const rowMarkup = orders.map(
    ({ shopify_order_id, email, created_at, financial_status, total_price, currency }, index) => {

      const normalizedStatus = (financial_status || "PENDING").toUpperCase();
      
      // 🚨 ADD THE 'return' KEYWORD HERE! 🚨
      return (
        <IndexTable.Row id={shopify_order_id} key={shopify_order_id} position={index}>
          <IndexTable.Cell>
            <Text variant="bodyMd" fontWeight="bold" as="span">
              #{shopify_order_id}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>{email || "No email"}</IndexTable.Cell>
          <IndexTable.Cell>
            {new Date(created_at).toLocaleDateString()}
          </IndexTable.Cell>
          
          <IndexTable.Cell>
            <Badge tone={normalizedStatus === "PAID" ? "success" : "attention"}>
              {normalizedStatus}
            </Badge>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {currency} {total_price}
          </IndexTable.Cell>
        </IndexTable.Row>
      ); // 🚨 Don't forget to close the parenthesis and semicolon 🚨
    }
  );

  return (
    <Page 
      title="Orders" 
      primaryAction={{ content: "Fetch Orders", onAction: handleFetchOrders }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "order", plural: "orders" }}
              itemCount={orders.length}
              headings={[
                { title: "Order ID" },
                { title: "Customer" },
                { title: "Date" },
                { title: "Payment Status" },
                { title: "Total" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}