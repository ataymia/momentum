import type { WorkerClassification } from "./hcm-engine";

export const DOCUMENT_TEMPLATE_STORAGE_KEY = "momentum-document-templates-v1";

export type DocumentTemplateKind = "Employment agreement" | "Compensation notice" | "Form I-9" | "Form W-4" | "Arizona Form A-4" | "Form W-9" | "Other";
export type DocumentApplicability = "All workers" | "Employees" | "Contractors";
export type SignatureMethod = "Typed" | "Drawn";
export type DocumentTemplateFieldType = "Text" | "Date" | "Checkbox" | "Signature" | "Initials";

export type DocumentTemplateField = {
  id: string;
  label: string;
  type: DocumentTemplateFieldType;
  required: boolean;
  pdfFieldName?: string;
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type DocumentTemplateRecord = {
  id: string;
  kind: DocumentTemplateKind;
  title: string;
  applicability: DocumentApplicability;
  originalFileName: string;
  storagePath: string;
  version: number;
  active: boolean;
  fields: DocumentTemplateField[];
  uploadedBy: string;
  uploadedAt: string;
};

export type SignatureEvidence = {
  method: SignatureMethod;
  signerName: string;
  signedAt: string;
  typedValue?: string;
  drawnDataUrl?: string;
};

export type EmployeeDocumentPacket = {
  id: string;
  userId: string;
  templateId: string;
  status: "Assigned" | "In progress" | "Submitted" | "Completed";
  fieldValues: Record<string, string | boolean>;
  signature?: SignatureEvidence;
  assignedAt: string;
  submittedAt?: string;
  completedFilePath?: string;
};

export type DocumentTemplateState = {
  version: 1;
  templates: DocumentTemplateRecord[];
  packets: EmployeeDocumentPacket[];
};

export const createDocumentTemplateSeed = (): DocumentTemplateState => ({ version: 1, templates: [], packets: [] });

const kinds = new Set<DocumentTemplateKind>(["Employment agreement", "Compensation notice", "Form I-9", "Form W-4", "Arizona Form A-4", "Form W-9", "Other"]);
const applicability = new Set<DocumentApplicability>(["All workers", "Employees", "Contractors"]);
const fieldTypes = new Set<DocumentTemplateFieldType>(["Text", "Date", "Checkbox", "Signature", "Initials"]);
const packetStatuses = new Set<EmployeeDocumentPacket["status"]>(["Assigned", "In progress", "Submitted", "Completed"]);
const validInstant = (value?: string) => Boolean(value && !Number.isNaN(new Date(value).getTime()));

export function normalizeDocumentTemplateState(input: unknown): DocumentTemplateState {
  if (!input || typeof input !== "object") return createDocumentTemplateSeed();
  const raw = input as Partial<DocumentTemplateState>;
  const templateIds = new Set<string>();
  const templates = (Array.isArray(raw.templates) ? raw.templates : []).filter((template): template is DocumentTemplateRecord => {
    if (!template || typeof template !== "object" || !template.id || templateIds.has(template.id) || !kinds.has(template.kind) || !template.title?.trim() || !applicability.has(template.applicability) || !template.originalFileName?.trim() || !template.storagePath?.trim() || !Number.isInteger(template.version) || template.version < 1 || typeof template.active !== "boolean" || !Array.isArray(template.fields) || !template.uploadedBy || !validInstant(template.uploadedAt)) return false;
    const fieldIds = new Set<string>();
    if (template.fields.some((field) => !field?.id || fieldIds.has(field.id) || !(fieldIds.add(field.id)) || !field.label?.trim() || !fieldTypes.has(field.type) || typeof field.required !== "boolean")) return false;
    templateIds.add(template.id);
    return true;
  });
  const packetIds = new Set<string>();
  const packets = (Array.isArray(raw.packets) ? raw.packets : []).filter((packet): packet is EmployeeDocumentPacket => {
    if (!packet || typeof packet !== "object" || !packet.id || packetIds.has(packet.id) || !packet.userId || !templateIds.has(packet.templateId) || !packetStatuses.has(packet.status) || !packet.fieldValues || typeof packet.fieldValues !== "object" || !validInstant(packet.assignedAt)) return false;
    if (packet.submittedAt && !validInstant(packet.submittedAt)) return false;
    if (packet.signature && (!packet.signature.signerName?.trim() || !validInstant(packet.signature.signedAt) || (packet.signature.method === "Typed" ? !packet.signature.typedValue?.trim() : !packet.signature.drawnDataUrl?.startsWith("data:image/")))) return false;
    packetIds.add(packet.id);
    return true;
  });
  return { version: 1, templates, packets };
}

export function requiredTemplateKinds(classification: WorkerClassification): DocumentTemplateKind[] {
  const common: DocumentTemplateKind[] = ["Employment agreement", "Compensation notice"];
  if (classification === "Contractor") return [...common, "Form W-9"];
  if (classification === "Hourly" || classification === "Salary") return [...common, "Form I-9", "Form W-4", "Arizona Form A-4"];
  return common;
}

export function templateApplies(template: DocumentTemplateRecord, classification: WorkerClassification) {
  if (!template.active) return false;
  if (template.applicability === "All workers") return true;
  if (template.applicability === "Contractors") return classification === "Contractor";
  return classification === "Hourly" || classification === "Salary";
}

export function activeTemplateForKind(state: DocumentTemplateState, kind: DocumentTemplateKind, classification: WorkerClassification) {
  return state.templates
    .filter((template) => template.kind === kind && templateApplies(template, classification))
    .sort((left, right) => right.version - left.version || right.uploadedAt.localeCompare(left.uploadedAt))[0];
}

export function missingRequiredTemplateKinds(state: DocumentTemplateState, classification: WorkerClassification) {
  return requiredTemplateKinds(classification).filter((kind) => !activeTemplateForKind(state, kind, classification));
}

export function createSignatureEvidence(method: SignatureMethod, signerName: string, value: string, signedAt = new Date().toISOString()): SignatureEvidence | null {
  const name = signerName.trim();
  const signature = value.trim();
  if (!name || !signature || !validInstant(signedAt)) return null;
  if (method === "Drawn" && !signature.startsWith("data:image/")) return null;
  return method === "Typed" ? { method, signerName: name, signedAt, typedValue: signature } : { method, signerName: name, signedAt, drawnDataUrl: signature };
}
