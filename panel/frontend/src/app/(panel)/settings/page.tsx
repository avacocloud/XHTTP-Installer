"use client";

import api from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordSchema, type ChangePasswordValues } from "@/lib/validations";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Lock, Save, Globe } from "lucide-react";

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values: ChangePasswordValues) => {
    try {
      await api.post("/auth/change-password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success(t("settings.passwordChanged"));
      form.reset();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to change password");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("settings.title")}</h1>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t("settings.language")}
          </CardTitle>
          <CardDescription>{t("settings.languageDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup type="single" value={locale} onValueChange={(v) => { if (v) setLocale(v as "en" | "fa"); }}>
            <ToggleGroupItem value="en" className="px-4">English</ToggleGroupItem>
            <ToggleGroupItem value="fa" className="px-4">فارسی</ToggleGroupItem>
          </ToggleGroup>
        </CardContent>
      </Card>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            {t("settings.changePassword")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>{t("settings.currentPassword")}</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage>{form.formState.errors.currentPassword && t(form.formState.errors.currentPassword.message!)}</FormMessage>
                  </FormItem>
                )}
              />
              <Separator />
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>{t("settings.newPassword")}</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage>{form.formState.errors.newPassword && t(form.formState.errors.newPassword.message!)}</FormMessage>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>{t("settings.confirmPassword")}</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage>{form.formState.errors.confirmPassword && t(form.formState.errors.confirmPassword.message!)}</FormMessage>
                  </FormItem>
                )}
              />
              <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
                <Save className="h-3.5 w-3.5" />
                {form.formState.isSubmitting ? t("settings.saving") : t("settings.save")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
