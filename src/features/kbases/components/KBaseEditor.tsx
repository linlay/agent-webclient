import React, { useState } from "react";
import { Button, Form, Input, Modal, Switch, Typography } from "antd";
import { t } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { DirectoryPickerModal } from "@/shared/ui/DirectoryPickerModal";
import { useDirectoryPicker } from "@/shared/ui/useDirectoryPicker";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import { saveKBase } from "@/shared/data/api/requests/kbases";
import type {
  KnowledgeBase,
  KnowledgeBaseInput,
} from "@/shared/data/api/dto/kbases";
import {
  COLLECTION_NAME_PATTERN,
  collectionNameFromPath,
  libraryCollections,
} from "../lib/documentSource";
import styles from "./KBasesConsole.module.css";
import { UiButton } from "@/shared/ui/UiButton";

export function KBaseEditor({
  library,
  onClose,
  onSaved,
}: {
  library: KnowledgeBase | "new";
  onClose: () => void;
  onSaved: (library: KnowledgeBase) => Promise<void>;
}) {
  const [form] = Form.useForm<KnowledgeBaseInput>();
  const [saving, setSaving] = useState(false);
  const message = useAppMessage();
  const directory = useDirectoryPicker();
  const save = async () => {
    let values: KnowledgeBaseInput;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const response = await saveKBase(
        library === "new"
          ? values
          : { ...values, baseRevision: library.baseRevision },
        library === "new" ? undefined : library.id,
      );
      if (response.data) await onSaved(response.data);
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  // A picked directory only fills the source of the row that asked for it; an
  // empty collection name follows the directory basename.
  const chooseSourceDirectory = async (index: number) => {
    try {
      const current = form.getFieldValue(["collections", index, "sourcePath"]);
      const path = await directory.pick(
        typeof current === "string" ? current : "",
      );
      if (!path) return;
      form.setFieldValue(["collections", index, "sourcePath"], path);
      const name = form.getFieldValue(["collections", index, "name"]);
      if (!String(name ?? "").trim()) {
        const suggestion = collectionNameFromPath(path);
        if (suggestion)
          form.setFieldValue(["collections", index, "name"], suggestion);
      }
    } catch (pickError) {
      message.error(
        pickError instanceof Error ? pickError.message : String(pickError),
      );
    }
  };
  return (
    <Modal
      width={720}
      title={library === "new" ? t("kbases.create") : t("kbases.edit")}
      open
      confirmLoading={saving}
      okText={t("kbases.save")}
      cancelText={t("kbases.cancel")}
      closable={!saving}
      maskClosable={!saving}
      keyboard={!saving}
      onCancel={() => {
        if (!saving) onClose();
      }}
      onOk={() => {
        if (!saving) void save();
      }}
      className={styles.editor}
    >
      <div className={styles.editorScroll}>
        <Form
          form={form}
          layout="vertical"
          disabled={saving}
          initialValues={
            library === "new"
              ? {
                  name: "",
                  description: "",
                  collections: [{ name: "workspace", sourcePath: "" }],
                }
              : {
                  name: library.name,
                  description: library.description,
                  collections: libraryCollections(library).map((c) => ({
                    ...c,
                  })),
                }
          }
        >
          <Form.Item
            name="name"
            label={t("kbases.name")}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label={t("kbases.description")}>
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
          <Typography.Text strong>{t("kbases.collections")}</Typography.Text>
          <Typography.Paragraph type="secondary">
            {t("kbases.sourceHint")}
          </Typography.Paragraph>
          <Form.List
            name="collections"
            rules={[
              {
                validator: async (_, values) => {
                  if (!values?.length || values.length > 32)
                    throw new Error(t("kbases.collectionCount"));
                  const names = values.map((c: { name?: string }) => c?.name);
                  if (new Set(names).size !== names.length)
                    throw new Error(t("kbases.duplicateCollection"));
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                <div className={styles.collectionLabels} aria-hidden="true">
                  <span>{t("kbases.collectionName")}</span>
                  <span>{t("kbases.source")}</span>
                </div>
                {fields.map((field) => (
                  <React.Fragment key={field.key}>
                    <div className={styles.collectionRow}>
                      <Form.Item
                        name={[field.name, "name"]}
                        rules={[
                          {
                            required: true,
                            message: t("kbases.collectionNameHint"),
                          },
                          {
                            pattern: COLLECTION_NAME_PATTERN,
                            message: t("kbases.collectionNameHint"),
                          },
                        ]}
                      >
                        <Input
                          aria-label={`${t("kbases.collectionName")} ${field.name + 1}`}
                          maxLength={64}
                          placeholder={t("kbases.collectionNamePlaceholder")}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "sourcePath"]}
                        normalize={(value) => value.trim()}
                        rules={[
                          {
                            required: true,
                            whitespace: true,
                            message: t("kbases.sourceRequired"),
                          },
                        ]}
                      >
                        <Input
                          aria-label={`${t("kbases.source")} ${field.name + 1}`}
                          placeholder="/path/to/documents"
                          suffix={
                            <UiButton
                              variant="ghost"
                              size="mini"
                              aria-label={`${t("kbases.selectSourceDirectory")} ${field.name + 1}`}
                              title={
                                directory.nativeAvailable
                                  ? t("directoryPicker.localHint")
                                  : t("directoryPicker.hostHint")
                              }
                              disabled={
                                saving || directory.loading || directory.open
                              }
                              iconOnly
                              onClick={() =>
                                void chooseSourceDirectory(field.name)
                              }
                            >
                              <MaterialIcon name="folder_open" />
                            </UiButton>
                          }
                        />
                      </Form.Item>
                      <UiButton
                        variant="ghost"
                        size="mini"
                        color="danger"
                        aria-label={`${t("kbases.removeCollection")} ${field.name + 1}`}
                        title={t("kbases.removeCollection")}
                        disabled={saving || fields.length <= 1}
                        iconOnly
                        className="tw:mt-[4px]"
                        onClick={() => remove(field.name)}
                      >
                        <MaterialIcon name="delete" />
                      </UiButton>
                    </div>
                    <Form.Item
                      name={[field.name, "description"]}
                      label={t("knowledge.collection.description")}
                    >
                      <Input.TextArea
                        aria-label={`${t("knowledge.collection.description")} ${field.name + 1}`}
                        rows={2}
                        maxLength={1000}
                      />
                    </Form.Item>
                    <details>
                      <summary>{t("knowledge.collection.options")}</summary>
                      <Form.Item
                        name={[field.name, "include"]}
                        label={t("knowledge.collection.include")}
                        getValueProps={(value) => ({
                          value: value?.join("\n") || "",
                        })}
                        getValueFromEvent={(event) =>
                          event.target.value
                            ? event.target.value
                                .split("\n")
                                .map((v: string) => v.trim())
                                .filter(Boolean)
                            : undefined
                        }
                      >
                        <Input.TextArea rows={2} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "exclude"]}
                        label={t("knowledge.collection.exclude")}
                        getValueProps={(value) => ({
                          value: value?.join("\n") || "",
                        })}
                        getValueFromEvent={(event) =>
                          event.target.value
                            ? event.target.value
                                .split("\n")
                                .map((v: string) => v.trim())
                                .filter(Boolean)
                            : undefined
                        }
                      >
                        <Input.TextArea rows={2} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "defaultQuery"]}
                        hidden
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                      <Form.Item name={[field.name, "chunk"]} hidden>
                        <Input />
                      </Form.Item>
                      <Typography.Paragraph type="secondary">
                        {t("knowledge.collection.chunkHint")}
                      </Typography.Paragraph>
                    </details>
                  </React.Fragment>
                ))}
                <Button
                  type="dashed"
                  block
                  disabled={saving || fields.length >= 32}
                  icon={<MaterialIcon name="add" />}
                  onClick={() => add({ name: "", sourcePath: "" })}
                >
                  {t("kbases.addCollection")}
                </Button>
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>
        </Form>
        <Typography.Paragraph className={styles.editHint} type="secondary">
          {t("kbases.collectionEditHint")}
        </Typography.Paragraph>
      </div>
      <DirectoryPickerModal
        open={directory.open}
        title={t("kbases.selectSourceDirectory")}
        hint={t("directoryPicker.hostHint")}
        listing={directory.listing}
        loading={directory.loading}
        error={directory.error}
        canChoose={directory.canChoose}
        onBrowse={directory.browseTo}
        onChoose={() => {
          directory.choose();
        }}
        onCancel={directory.close}
      />
    </Modal>
  );
}
