export type ArtifactListItem = {
  id: string;
  job_id: string;
  title: string;
  company: string;
  location?: string;
  updated_at: string;
  has_overrides: boolean;
  thumbnail_url?: string | null;
  video_url?: string | null;
};

export type ArtifactDetail = {
  id: string;
  extracted: any;
  bubbles: any;
  overrides?: any;
  assets: {
    logo_url?: string | null;
    video_url?: string | null;
    thumbnail_url?: string | null;
    video_version?: string | null;
    thumbnail_version?: string | null;
  };
  jingles: string[];
};

export type EditorDraft = {
  company: string;
  title: string;
  location: string;
  expects: string[];
  offers: string[];
  theme: {
    primary: string;
    secondary: string;
    text: string;
    logo_bg: string;
  };
  jingle: string;
  showGuides: boolean;
};
