import { Modal, Text, TextContainer } from "@shopify/polaris";

export default function DescriptionModal({ isOpen, onClose, description }) {
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Full Description"
    >
      <Modal.Section>
        <TextContainer>
          <Text variant="bodyMd" as="p">{description}</Text>
        </TextContainer>
      </Modal.Section>
    </Modal>
  );
}