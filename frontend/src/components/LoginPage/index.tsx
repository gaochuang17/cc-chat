/**
 * 登录/注册页面：未登录时显示，支持两种模式切换。
 *
 * 使用 Ant Design 的 Form 组件，自带表单校验（邮箱格式、密码长度）。
 */
import { useState } from "react";
import { Form, Input, Button, message } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import styles from "./LoginPage.module.css";

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
}

export default function LoginPage({ onLogin, onRegister }: LoginPageProps) {
  // mode 控制当前是登录还是注册模式
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (values: {
    email: string;
    password: string;
  }) => {
    setLoading(true);
    setError("");
    try {
      if (mode === "login") {
        await onLogin(values.email, values.password);
      } else {
        await onRegister(values.email, values.password);
      }
    } catch (e) {
      const msg = (e as Error).message || "操作失败";
      setError(msg);
      // message.error 显示 Ant Design 全局提示（顶部短暂弹出）
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <RobotOutlined style={{ color: "var(--accent)" }} />
        </div>
        <h2 className={styles.title}>
          {mode === "login" ? "登录" : "注册"}
        </h2>

        {error && <div className={styles.error}>{error}</div>}

        <Form onFinish={handleSubmit} size="large">
          <Form.Item
            name="email"
            rules={[
              { required: true, message: "请输入邮箱" },
              { type: "email", message: "邮箱格式不正确" },
            ]}
          >
            <Input placeholder="邮箱" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 8, message: "密码至少 8 位" },
            ]}
          >
            <Input.Password placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              className={styles.submitBtn}
            >
              {mode === "login" ? "登录" : "注册"}
            </Button>
          </Form.Item>
        </Form>

        <div className={styles.footer}>
          {mode === "login" ? "还没有账号？" : "已有账号？"}
          <button
            type="button"
            className={styles.toggleBtn}
            onClick={() => {
              // 切换模式时清空错误信息
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              marginLeft: 4,
            }}
          >
            {mode === "login" ? "注册" : "登录"}
          </button>
        </div>
      </div>
    </div>
  );
}
