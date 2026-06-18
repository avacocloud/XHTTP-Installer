"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { loginSchema, type LoginValues } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Rocket, Globe, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const login = useAuth((s) => s.login);
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    setError("");
    try {
      await login(values.username, values.password);
      router.push("/dashboard");
    } catch {
      setError(t("login.error"));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground">
            <Rocket className="h-5 w-5 text-background" />
          </div>
          <CardTitle className="text-lg">{t("login.title")}</CardTitle>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} method="post" className="space-y-3">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>{t("login.username")}</FormLabel>
                    <FormControl>
                      <Input placeholder="admin" {...field} />
                    </FormControl>
                    <FormMessage>{form.formState.errors.username && t(form.formState.errors.username.message!)}</FormMessage>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>{t("login.password")}</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage>{form.formState.errors.password && t(form.formState.errors.password.message!)}</FormMessage>
                  </FormItem>
                )}
              />
              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" size="sm" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t("login.signingIn") : t("login.signIn")}
              </Button>
            </form>
          </Form>
          <div className="mt-3 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocale(locale === "en" ? "fa" : "en")}
              className="text-muted-foreground h-7 text-xs"
            >
              <Globe className="h-3.5 w-3.5" />
              {locale === "en" ? "فارسی" : "English"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
