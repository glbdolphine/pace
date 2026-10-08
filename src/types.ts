export interface AppUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  disabled?: boolean;
  createdAt?: string;
}

export interface StoredUser extends AppUser {
  password?: string;
}

export interface AdminUserSummary {
  id: string;
  username: string;
  displayName: string;
  role: string;
  disabled: boolean;
  createdAt: string;
  password?: string;
  logCount?: number;
}

export interface LogChange {
  at: string;
  by: string;
  action: 'created' | 'edited';
  changes?: { field: string; from: string; to: string }[];
}

export interface LogEntry {
  id: string;
  logNo: number | string;
  date: string;
  resellerName: string;
  resellerPhone?: string; // Reseller phone number
  requestType: string;
  customerName: string; // Institute / School / Client name
  headTeacherName?: string; // Head Teacher / In-Charge Name
  headTeacherPhone?: string; // Head Teacher / In-Charge Phone
  nmsId: string; // NMS ID / Connection ID
  edcNo?: string; // EDC Book No. / সুত্র নং
  routerSerial?: string;
  mac: string;
  lat?: string; // Latitude
  long?: string; // Longitude
  unionName?: string; // Union / Ward / Pouroshova
  upazila?: string; // Upazila / City Corporation
  fiberLength?: string; // Fiber cable length in meters
  category?: string; // e.g. 01.Primary Education, 02.Secondary Education, etc.
  nameBn?: string; // Institute name in Bangla - this is the name shown in the logs
  nameEn?: string; // Institute name in English - kept for reference, not shown in the logs
  issueFound: string;
  missingWrongDetails: string;
  actionTaken: string;
  reasonForAction: string;
  resellerInformed: string;
  followUpNeeded: string;
  status: string;
  supervisorInformed: string;
  remarks: string;
  formReceivedAt?: string;
  billReceivedAt?: string;
  /** Months ('YYYY-MM') a bill was received for. */
  billMonths?: string[];
  resellerId?: string;
  followUpDate?: string;
  deletedAt?: string;
  deletedBy?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  history?: LogChange[];
}

export type MarkKind = 'form' | 'bill';
export type MarkAction = 'received' | 'not_received';

export interface ApprovalRequest {
  id: string;
  logId: string;
  logNo?: number | string;
  customer?: string;
  kind: MarkKind;
  action: MarkAction;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  /** Receiving month ('YYYY-MM') a bill mark is for. */
  month?: string;
  /** Date ('YYYY-MM-DD') a form was received. */
  receivedOn?: string;
}

export interface Reseller {
  id: string;
  name: string;
  area: string;
  phone: string;
  active: boolean;
  createdAt: string;
  deletedAt?: string;
  deletedBy?: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  by: string;
  action: string;
  logNo?: number | string;
  customer?: string;
  detail?: string;
}

export type LogFieldKey =
  | 'resellerName'
  | 'resellerPhone'
  | 'requestType'
  | 'customerName'
  | 'nmsId'
  | 'issueFound'
  | 'missingWrongDetails'
  | 'actionTaken'
  | 'reasonForAction'
  | 'resellerInformed'
  | 'followUpNeeded'
  | 'status'
  | 'supervisorInformed'
  | 'remarks'
  | 'mac'
  | 'upazila'
  | 'unionName'
  | 'category';

export type FieldSuggestionsMap = Record<string, string[]>;
