import { useState, useEffect, useCallback } from "react";
import { useSubmit } from "react-router";
import {
  Modal, FormLayout, TextField, Select,
  InlineStack, BlockStack, Text, Divider, Box, Button, Banner
} from "@shopify/polaris";

let _uid = 0;
const newRow = (optionName = "", optionValues = "") => ({
  _key: ++_uid,
  optionName,
  optionValues,
});

const MAX_OPTIONS = 3; // Shopify hard limit

export default function ProductModal({ isOpen, onClose, isSubmitting, initialData }) {
  const submit = useSubmit();

  const emptyForm = {
    title: "", description: "", vendor: "",
    product_type: "", sku: "", price: "", status: "active",
  };

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [variantOptions, setVariantOptions] = useState([newRow()]);

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setForm({
        title: initialData.title || "",
        description: initialData.description || "",
        vendor: initialData.vendor || "",
        product_type: initialData.product_type || "",
        sku: initialData.sku || "",
        price: initialData.price ? initialData.price.toString() : "",
        status: initialData.status || "active",
      });

      if (initialData.variants && Object.keys(initialData.variants).length > 0) {
        setVariantOptions(
          Object.entries(initialData.variants).map(([key, vals]) =>
            newRow(key, Array.isArray(vals) ? vals.join(", ") : vals)
          )
        );
      } else {
        setVariantOptions([newRow()]);
      }
    } else {
      setForm(emptyForm);
      setVariantOptions([newRow()]);
    }

    setErrors({});
  }, [isOpen, initialData]);

  const handleChange = (value, id) => {
    setForm(prev => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors(prev => ({ ...prev, [id]: undefined }));
  };

  const handleVariantChange = useCallback((key, field, value) => {
    setVariantOptions(prev =>
      prev.map(row => row._key === key ? { ...row, [field]: value } : row)
    );
  }, []);

  const handleRemoveOrClearVariant = useCallback((key) => {
    setVariantOptions(prev => {
      if (prev.length === 1) return [newRow()];
      return prev.filter(row => row._key !== key);
    });
  }, []);

  const handleAddOption = useCallback(() => {
    setVariantOptions(prev => {
      if (prev.length >= MAX_OPTIONS) return prev; // safety guard
      return [...prev, newRow()];
    });
  }, []);

  const handleSave = () => {
    const newErrors = {};
    if (!form.title?.trim()) newErrors.title = "Required";
    if (!form.price || !/^\d+(\.\d+)?$/.test(form.price)) {
      newErrors.price = "Numeric only";
    } else if (parseFloat(form.price) <= 0) {
      newErrors.price = "Must be > 0";
    }
    if (!form.vendor?.trim()) newErrors.vendor = "Required";
    if (!form.product_type?.trim()) newErrors.product_type = "Required";

    if (Object.keys(newErrors).length > 0) return setErrors(newErrors);

    const finalVariants = {};
    variantOptions.forEach(opt => {
      const key = opt.optionName.trim();
      const vals = opt.optionValues.split(",").map(v => v.trim()).filter(Boolean);
      if (key && vals.length > 0) finalVariants[key] = vals;
    });

    const payload = {
      type: initialData ? "update" : "create",
      variants: JSON.stringify(finalVariants),
      ...form,
    };

    if (initialData) {
      payload.shopify_product_id = initialData.shopify_product_id.toString();
    }

    submit(payload, { method: "post" });
    onClose();
  };

  const isEditMode = !!initialData;
  const atMaxOptions = variantOptions.length >= MAX_OPTIONS;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={isEditMode ? "Edit Product" : "Create New Product"}
      primaryAction={{
        content: isEditMode ? "Save Changes" : "Save Product",
        onAction: handleSave,
        loading: isSubmitting,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose, disabled: isSubmitting }]}
    >
      <Modal.Section>
        <FormLayout>
          <FormLayout.Group>
            <TextField label="Title" value={form.title} onChange={handleChange} id="title" autoComplete="off" requiredIndicator error={errors.title} />
            <TextField label="Price (Rs.)" value={form.price} onChange={handleChange} id="price" autoComplete="off" requiredIndicator error={errors.price} />
          </FormLayout.Group>

          <TextField label="Description" value={form.description} onChange={handleChange} id="description" multiline={3} autoComplete="off" />

          <FormLayout.Group>
            <TextField label="Vendor" value={form.vendor} onChange={handleChange} id="vendor" autoComplete="off" requiredIndicator error={errors.vendor} />
            <TextField label="Product Type" value={form.product_type} onChange={handleChange} id="product_type" autoComplete="off" requiredIndicator error={errors.product_type} />
          </FormLayout.Group>

          <FormLayout.Group>
            <TextField label="SKU" value={form.sku} onChange={handleChange} id="sku" autoComplete="off" />
            <Select
              label="Status"
              options={[
                { label: "Active", value: "active" },
                { label: "Draft", value: "draft" },
              ]}
              value={form.status}
              onChange={handleChange}
              id="status"
            />
          </FormLayout.Group>

          <Divider />

          <BlockStack gap="300">
            <Text variant="headingMd" as="h3">Variants</Text>

            {atMaxOptions && (
              <Banner tone="info">
                Shopify allows a maximum of 3 variant options per product.
              </Banner>
            )}

            {variantOptions.map((opt, index) => (
              <InlineStack key={opt._key} gap="300" blockAlign="end" wrap={false}>
                <Box minWidth="140px">
                  <TextField
                    label={index === 0 ? "Option Name" : undefined}
                    placeholder="e.g. Size"
                    value={opt.optionName}
                    onChange={(val) => handleVariantChange(opt._key, "optionName", val)}
                    autoComplete="off"
                  />
                </Box>
                <Box width="100%">
                  <TextField
                    label={index === 0 ? "Values (comma-separated)" : undefined}
                    placeholder="e.g. S, M, L"
                    value={opt.optionValues}
                    onChange={(val) => handleVariantChange(opt._key, "optionValues", val)}
                    autoComplete="off"
                  />
                </Box>

                <Button
                  tone="critical"
                  onClick={() => handleRemoveOrClearVariant(opt._key)}
                >
                  {variantOptions.length === 1 ? "Clear" : "Remove"}
                </Button>
              </InlineStack>
            ))}

            {/* Hide the Add button once at max */}
            {!atMaxOptions && (
              <InlineStack>
                <Button onClick={handleAddOption}>+ Add Option</Button>
              </InlineStack>
            )}
          </BlockStack>
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}