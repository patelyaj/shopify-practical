import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>

      <body>
        {/* ✅ Shopify App Bridge Provider (REQUIRED) */}
        <ShopifyAppProvider>
          
          {/* ✅ Polaris UI Provider */}
          <PolarisAppProvider i18n={enTranslations}>
            <Outlet />
          </PolarisAppProvider>

        </ShopifyAppProvider>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}