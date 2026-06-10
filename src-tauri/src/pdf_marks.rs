//! Vložení značek průchodek do PDF bez přepisování vložených obrázků (lopdf).
//! Používá se u velkých tiskových PDF, kde pdf-lib v WebView selže na „Invalid array length“.

use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object};
use serde::Deserialize;

const MM_TO_PT: f64 = 72.0 / 25.4;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkPositionDto {
  pub x: f64,
  pub y: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkColorDto {
  #[serde(rename = "type")]
  pub color_type: String,
  pub r: Option<f64>,
  pub g: Option<f64>,
  pub b: Option<f64>,
  pub c: Option<f64>,
  pub m: Option<f64>,
  pub y: Option<f64>,
  pub k: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddGrommetMarksArgs {
  pub input_path: String,
  pub output_path: String,
  pub positions: Vec<MarkPositionDto>,
  pub shape: String,
  pub size_mm: f64,
  pub border_color: MarkColorDto,
  pub border_width_pt: Option<f64>,
}

fn object_to_f64(obj: &Object) -> f64 {
  obj.as_f32().map(f64::from).unwrap_or(0.0)
}

fn read_page_box(page_dict: &Dictionary, doc: &Document, keys: &[&[u8]]) -> Option<[f64; 4]> {
  for key in keys {
    if let Ok(obj) = page_dict.get_deref(*key, doc) {
      if let Ok(arr) = obj.as_array() {
        if arr.len() >= 4 {
          let mut vals = [0.0; 4];
          for (i, item) in arr.iter().take(4).enumerate() {
            vals[i] = object_to_f64(item);
          }
          return Some(vals);
        }
      }
    }
  }
  None
}

fn read_user_unit(page_dict: &Dictionary, doc: &Document) -> f64 {
  page_dict
    .get_deref(b"UserUnit", doc)
    .ok()
    .map(object_to_f64)
    .filter(|v| *v > 0.0)
    .unwrap_or(1.0)
}

fn set_page_box(page_dict: &mut Dictionary, key: &[u8], rect: [f64; 4]) {
  page_dict.set(
    key.to_vec(),
    Object::Array(vec![
      Object::Real(rect[0] as f32),
      Object::Real(rect[1] as f32),
      Object::Real(rect[2] as f32),
      Object::Real(rect[3] as f32),
    ]),
  );
}

fn normalize_boxes_to_trim(page_dict: &mut Dictionary, doc: &Document) {
  let trim = read_page_box(
    page_dict,
    doc,
    &[b"TrimBox", b"CropBox", b"MediaBox"],
  )
  .unwrap_or([0.0, 0.0, 595.0, 842.0]);

  for key in [b"MediaBox", b"CropBox", b"BleedBox", b"TrimBox", b"ArtBox"] as [&[u8]; 5] {
    set_page_box(page_dict, key, trim);
  }
}

/// Kruh jako čtyři kubické Bézierovy křivky (aproximace kružnice).
fn append_circle_path(ops: &mut Vec<Operation>, cx: f64, cy: f64, r: f64) {
  let k = 0.5522847498 * r;
  ops.push(Operation::new(
    "m",
    vec![
      Object::Real((cx + r) as f32),
      Object::Real(cy as f32),
    ],
  ));
  ops.push(Operation::new(
    "c",
    vec![
      Object::Real((cx + r) as f32),
      Object::Real((cy + k) as f32),
      Object::Real((cx + k) as f32),
      Object::Real((cy + r) as f32),
      Object::Real(cx as f32),
      Object::Real((cy + r) as f32),
    ],
  ));
  ops.push(Operation::new(
    "c",
    vec![
      Object::Real((cx - k) as f32),
      Object::Real((cy + r) as f32),
      Object::Real((cx - r) as f32),
      Object::Real((cy + k) as f32),
      Object::Real((cx - r) as f32),
      Object::Real(cy as f32),
    ],
  ));
  ops.push(Operation::new(
    "c",
    vec![
      Object::Real((cx - r) as f32),
      Object::Real((cy - k) as f32),
      Object::Real((cx - k) as f32),
      Object::Real((cy - r) as f32),
      Object::Real(cx as f32),
      Object::Real((cy - r) as f32),
    ],
  ));
  ops.push(Operation::new(
    "c",
    vec![
      Object::Real((cx + k) as f32),
      Object::Real((cy - r) as f32),
      Object::Real((cx + r) as f32),
      Object::Real((cy - k) as f32),
      Object::Real((cx + r) as f32),
      Object::Real(cy as f32),
    ],
  ));
}

fn color_ops(color: &MarkColorDto) -> Vec<Operation> {
  if color.color_type == "cmyk" {
    vec![Operation::new(
      "K",
      vec![
        Object::Real(color.c.unwrap_or(0.0) as f32),
        Object::Real(color.m.unwrap_or(0.0) as f32),
        Object::Real(color.y.unwrap_or(0.0) as f32),
        Object::Real(color.k.unwrap_or(0.0) as f32),
      ],
    )]
  } else {
    vec![Operation::new(
      "RG",
      vec![
        Object::Real(color.r.unwrap_or(0.0) as f32),
        Object::Real(color.g.unwrap_or(0.0) as f32),
        Object::Real(color.b.unwrap_or(0.0) as f32),
      ],
    )]
  }
}

fn build_mark_operations(args: &AddGrommetMarksArgs, origin_x: f64, origin_y: f64, user_unit: f64) -> Content {
  let border_width = args.border_width_pt.unwrap_or(0.5) / user_unit;
  let size_pt = (args.size_mm * MM_TO_PT) / user_unit;
  let half_pt = size_pt / 2.0;
  let is_circle = args.shape != "square";

  let mut operations = Vec::new();
  operations.push(Operation::new("q", vec![]));
  operations.extend(color_ops(&args.border_color));
  operations.push(Operation::new(
    "w",
    vec![Object::Real(border_width as f32)],
  ));

  for pos in &args.positions {
    let x_pt = origin_x + (pos.x * MM_TO_PT) / user_unit;
    let y_pt = origin_y + (pos.y * MM_TO_PT) / user_unit;

    if is_circle {
      append_circle_path(&mut operations, x_pt, y_pt, half_pt);
      operations.push(Operation::new("S", vec![]));
    } else {
      operations.push(Operation::new(
        "re",
        vec![
          Object::Real((x_pt - half_pt) as f32),
          Object::Real((y_pt - half_pt) as f32),
          Object::Real(size_pt as f32),
          Object::Real(size_pt as f32),
        ],
      ));
      operations.push(Operation::new("S", vec![]));
    }
  }

  operations.push(Operation::new("Q", vec![]));
  Content { operations }
}

pub fn add_grommet_marks_pdf(args: AddGrommetMarksArgs) -> Result<(), String> {
  let mut doc = Document::load(&args.input_path).map_err(|e| format!("Načtení PDF selhalo: {e}"))?;
  let pages = doc.get_pages();
  let page_id = *pages
    .get(&1)
    .ok_or_else(|| "PDF neobsahuje žádnou stránku.".to_string())?;

  let page_obj = doc
    .get_object(page_id)
    .map_err(|e| format!("Stránku nelze načíst: {e}"))?
    .to_owned();

  let mut page_dict = page_obj
    .as_dict()
    .map_err(|_| "Stránka není slovník.".to_string())?
    .clone();

  let trim = read_page_box(&page_dict, &doc, &[b"TrimBox", b"CropBox", b"MediaBox"])
    .ok_or_else(|| "Stránka nemá platný TrimBox/MediaBox.".to_string())?;
  let user_unit = read_user_unit(&page_dict, &doc);
  let origin_x = trim[0];
  let origin_y = trim[1];

  normalize_boxes_to_trim(&mut page_dict, &doc);
  doc.objects.insert(page_id, Object::Dictionary(page_dict));

  let mark_content = build_mark_operations(&args, origin_x, origin_y, user_unit);
  doc
    .add_to_page_content(page_id, mark_content)
    .map_err(|e| format!("Vložení značek selhalo: {e}"))?;

  if let Some(parent) = std::path::Path::new(&args.output_path).parent() {
    if !parent.as_os_str().is_empty() {
      std::fs::create_dir_all(parent).map_err(|e| format!("create_dir_all selhalo: {e}"))?;
    }
  }

  doc
    .save(&args.output_path)
    .map_err(|e| format!("Uložení PDF selhalo: {e}"))?;

  Ok(())
}

#[tauri::command]
pub fn add_grommet_marks_native(args: AddGrommetMarksArgs) -> Result<(), String> {
  add_grommet_marks_pdf(args)
}
