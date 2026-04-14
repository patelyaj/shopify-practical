import { useState, useEffect } from "react";
import { useSubmit } from "react-router";
import { Modal, FormLayout, TextField, Select } from "@shopify/polaris";

export default function CreateProductModal({ isOpen, onClose, isSubmitting }) {
  const submit = useSubmit();
  
  const [form, setForm] = useState({ title: "", description: "", vendor: "", product_type: "", sku: "", price: "", status: "active" });
  const [errors, setErrors] = useState({});

  const handleChange = (value, id) => {

    setForm(prev => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors(prev => ({ ...prev, [id]: undefined }));
  };

  useEffect(() => {
    if (!isSubmitting) {
      setForm({ title: "", description: "", vendor: "", product_type: "", sku: "", price: "", status: "active" });
      setErrors({});
    }
  }, [isSubmitting]);

  const handleSave = () => {
    const newErrors = {};
    if (!form.title?.trim()){ newErrors.title = "Title is required";}


if (!form.price || !/^\d+$/.test(form.price)) {
  newErrors.price = "Only numeric values allowed";
} else if (parseFloat(form.price) <= 0) {
  newErrors.price = "Price must be > 0";
}
    if (!form.vendor?.trim()) newErrors.vendor = "Vendor is required";
    if (!form.product_type?.trim()) newErrors.product_type = "Product type is required";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return; 
    }

    submit({ type: "create", ...form }, { method: "post" });
    onClose(); 
  };

  const handleClose = () => {
    setErrors({});
    onClose();
  };
  

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Create New Product"
      primaryAction={{ content: 'Save Product', onAction: handleSave}}
      secondaryActions={[{ content: 'Cancel', onAction: handleClose}]}
    >
      <Modal.Section>
        <FormLayout>
          <FormLayout.Group>
            <TextField label="Title" value={form.title} onChange={handleChange} id="title" autoComplete="off" requiredIndicator error={errors.title} />
            <TextField  label="Price (₹)" type="number" value={form.price} onChange={handleChange} id="price" autoComplete="off" requiredIndicator min={1} error={errors.price} />
          </FormLayout.Group>
          <TextField label="Description" value={form.description} onChange={handleChange} id="description" multiline={3} autoComplete="off" />
          <FormLayout.Group>
            <TextField label="Vendor" value={form.vendor} onChange={handleChange} id="vendor" autoComplete="off" requiredIndicator error={errors.vendor} />
            <TextField label="Product Type" value={form.product_type} onChange={handleChange} id="product_type" autoComplete="off" error={errors.product_type} />
          </FormLayout.Group>
          <FormLayout.Group>
            <TextField label="SKU" value={form.sku} onChange={handleChange} id="sku" autoComplete="off" />
            <Select label="Status" options={[{label: 'Active', value: 'active'}, {label: 'Draft', value: 'draft'}]} value={form.status} onChange={handleChange} id="status" />
          </FormLayout.Group>
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}
