export type InputPayload = {
  job_url: string;
  job_id?: string | number;
  company?: string;
  title?: string;
  company_site?: string;
  published?: string;
  job_ad_type?: string;
  channel?: {name?: string; id?: string};
  budget?: {currency?: string; min?: number; max?: number};
};

export type RunSingleResult = {
  job_key: string;
  input_path: string;
  extracted_path?: string;
  bubbles_path?: string;
  video_path?: string;
  thumbnail_path?: string;
  error?: string;
};
