import { Button, Checkbox, Form, Input, Select, Typography } from "antd";
import type { FormInstance } from "antd";

const { Paragraph, Text } = Typography;

export type PaymentKycFormValues = {
  businessType: "individual" | "company";
  businessProfileUrl: string;
  businessProfileMcc: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dobDay: number;
  dobMonth: number;
  dobYear: number;
  line1: string;
  city: string;
  postalCode: string;
  country: string;
  accountNumber: string;
  currency: string;
  tosAccepted: boolean;
  identityDocumentFront?: string;
};

type PaymentSetupKycFormProps = {
  form: FormInstance<PaymentKycFormValues>;
  loading: boolean;
  currentlyDue: string[] | undefined;
  onSubmit: (values: PaymentKycFormValues) => void;
};

/** Connect KYC fields (INT-191 / INT-195) — extracted from PaymentSetupPage for S3776. */
export function PaymentSetupKycForm({
  form,
  loading,
  currentlyDue,
  onSubmit,
}: Readonly<PaymentSetupKycFormProps>) {
  return (
    <>
      <Paragraph>
        <Text type="secondary">
          Outstanding: {(currentlyDue ?? []).join(", ") || "none"}
        </Text>
      </Paragraph>
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        initialValues={{
          businessType: "individual",
          businessProfileMcc: "5734",
          country: "FR",
          currency: "eur",
          dobDay: 1,
          dobMonth: 1,
          dobYear: 1902,
          line1: "address_full_match",
          city: "Paris",
          postalCode: "75002",
          identityDocumentFront: "file_identity_document_success",
          tosAccepted: false,
        }}
      >
        <Form.Item
          name="businessType"
          label="Business type"
          rules={[{ required: true }]}
        >
          <Select
            options={[
              { value: "individual", label: "Individual" },
              { value: "company", label: "Company" },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="businessProfileUrl"
          label="Business profile URL"
          rules={[{ required: true, type: "url" }]}
        >
          <Input placeholder="https://…" />
        </Form.Item>
        <Form.Item
          name="businessProfileMcc"
          label="MCC"
          rules={[{ required: true }]}
        >
          <Input placeholder="5734" />
        </Form.Item>
        <Form.Item name="firstName" label="First name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="lastName" label="Last name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="email"
          label="Email"
          rules={[{ required: true, type: "email" }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="phone" label="Phone">
          <Input />
        </Form.Item>
        <Form.Item
          name="dobDay"
          label="Date of birth — day"
          rules={[{ required: true }]}
        >
          <Input type="number" min={1} max={31} placeholder="1" />
        </Form.Item>
        <Form.Item
          name="dobMonth"
          label="Date of birth — month"
          rules={[{ required: true }]}
        >
          <Input type="number" min={1} max={12} placeholder="1" />
        </Form.Item>
        <Form.Item
          name="dobYear"
          label="Date of birth — year"
          rules={[{ required: true }]}
          extra="Test mode: use year 1902 for an immediate date-of-birth match."
        >
          <Input type="number" min={1900} max={2100} placeholder="1902" />
        </Form.Item>
        <Form.Item
          name="line1"
          label="Address"
          rules={[{ required: true }]}
          extra="Test mode: address_full_match (Stripe Connect testing tokens)."
        >
          <Input />
        </Form.Item>
        <Form.Item name="city" label="City" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="postalCode"
          label="Postal code"
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="country" label="Country" rules={[{ required: true }]}>
          <Input maxLength={2} placeholder="FR" />
        </Form.Item>
        <Form.Item
          name="identityDocumentFront"
          label="Identity document file id (optional)"
          extra="Test mode: use file_identity_document_success if identity checks need a file token."
        >
          <Input placeholder="file_identity_document_success" />
        </Form.Item>
        <Form.Item name="currency" label="Bank currency" rules={[{ required: true }]}>
          <Input maxLength={3} placeholder="eur" />
        </Form.Item>
        <Form.Item
          name="accountNumber"
          label="Bank account (IBAN / test number)"
          rules={[{ required: true }]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="tosAccepted"
          valuePropName="checked"
          rules={[
            {
              validator: (_, v) =>
                v
                  ? Promise.resolve()
                  : Promise.reject(new Error("Accept Stripe terms")),
            },
          ]}
        >
          <Checkbox>
            I accept the{" "}
            <a
              href="https://stripe.com/connect-account/legal"
              target="_blank"
              rel="noreferrer"
            >
              Stripe Connected Account Agreement
            </a>
          </Checkbox>
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={loading}>
          Submit KYC
        </Button>
      </Form>
    </>
  );
}
