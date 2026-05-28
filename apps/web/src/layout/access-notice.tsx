import { Alert, Button, Space, Typography } from "antd";
import { Link } from "react-router";

const { Paragraph } = Typography;

/**
 * INT-245 — friendly forbidden / empty guidance (Impeccable clarify + harden).
 * Prefer this over raw API status strings as the sole UX.
 */
export function AccessNotice({
  title = "This screen is not available for your role",
  detail = "Use the menu on the left for pages that match your signed-in role. If you need manager or operator access, ask your community administrator.",
  homeTo = "/",
}: {
  title?: string;
  detail?: string;
  homeTo?: string;
}) {
  return (
    <Alert
      type="warning"
      showIcon
      data-testid="access-notice"
      message={title}
      description={
        <Space direction="vertical" size={8}>
          <Paragraph style={{ margin: 0 }}>{detail}</Paragraph>
          <Link to={homeTo}>
            <Button type="primary" size="small">
              Back to home
            </Button>
          </Link>
        </Space>
      }
    />
  );
}
