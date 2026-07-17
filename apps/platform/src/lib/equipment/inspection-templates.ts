export type EquipmentInspectionItem = {
  key: string;
  label: string;
  critical?: boolean;
};

export type EquipmentInspectionTemplate = {
  key: string;
  label: string;
  version: number;
  items: EquipmentInspectionItem[];
};

export const equipmentInspectionTemplates: EquipmentInspectionTemplate[] = [
  template("aerial_lift", "Bucket truck / aerial lift", [
    critical("fluid_leaks", "No visible fluid leaks"),
    critical("tires", "Tires are serviceable with no visible damage"),
    critical("outriggers", "Outriggers and pads operate and are undamaged"),
    critical("emergency_lowering", "Emergency lowering system is ready"),
    critical("controls", "Upper and lower controls operate correctly"),
    critical("boom_condition", "Boom, pins, and welds show no visible damage"),
    critical("bucket_condition", "Bucket and attachment points show no visible damage"),
    critical("harness_points", "Harness and approved attachment points are present and serviceable"),
    item("alarms", "Alarms, interlocks, and emergency stop work"),
    critical("hydraulic_damage", "Hydraulic hoses, cylinders, and fittings show no visible damage"),
  ]),
  template("chipper", "Chipper", [
    critical("guards", "Guards and covers are installed and secure"),
    critical("feed_controls", "Feed controls operate correctly"),
    critical("emergency_stop", "Emergency stop operates correctly"),
    critical("knives_anvil", "Knives and anvil show no visible damage or abnormal wear"),
    item("tires_hitch", "Tires and hitch are serviceable"),
    critical("safety_chains", "Safety chains are present and serviceable"),
    item("lights", "Trailer and marker lights work"),
    critical("fluid_leaks", "No visible fluid leaks"),
    item("debris", "Machine is clear of unsafe debris buildup"),
  ]),
  template("trailer", "Trailer", [
    critical("hitch", "Coupler and hitch are secure"),
    critical("safety_chains", "Safety chains are crossed, connected, and serviceable"),
    critical("breakaway_cable", "Breakaway cable and battery are connected and serviceable"),
    critical("tires", "Tires have safe pressure, tread, and no visible damage"),
    critical("lights", "Brake, turn, marker, and license plate lights work"),
    critical("brakes", "Trailer brakes operate correctly when equipped"),
    critical("load_securement", "Load is balanced and properly secured"),
    item("jack", "Jack and wheel chocks are present and serviceable"),
    item("ramps_gates", "Ramps and gates are secured and serviceable"),
  ]),
  template("chainsaw", "Chainsaw", [
    critical("chain_brake", "Chain brake operates correctly"),
    critical("throttle_lock", "Throttle lockout operates correctly"),
    critical("chain_tension", "Chain tension is correct"),
    critical("bar_chain", "Bar and chain are serviceable"),
    critical("leaks", "No visible fuel or bar oil leak"),
    item("handles", "Handles and fasteners are secure"),
    critical("chain_catcher", "Chain catcher is present and undamaged"),
    critical("stop_switch", "Stop switch operates correctly"),
  ]),
  template("skid_steer", "Skid steer", [
    critical("restraint", "Seat bar, restraint, and interlocks work"),
    critical("hydraulics", "Hydraulic hoses, couplers, and cylinders show no leaks"),
    critical("attachment", "Attachment and locking pins are secure"),
    item("tires_tracks", "Tires or tracks are serviceable and tensioned"),
    item("controls", "Controls, backup alarm, lights, and parking brake work"),
    item("fluids", "Engine fluids and visible filters are acceptable"),
  ]),
  template("climbing_gear", "Climbing / rigging gear", [
    critical("rope", "Rope or line has no cuts, glazing, chemical damage, or severe wear"),
    critical("hardware", "Carabiners, snaps, rings, and friction devices close and lock"),
    critical("saddle", "Saddle, bridge, stitching, and connection points are sound"),
    item("labels", "Identification and retirement markings remain readable"),
    item("clean_storage", "Gear is clean, dry, and stored away from contaminants"),
  ]),
  template("ppe", "Personal protective equipment", [
    critical("helmet", "Helmet and suspension are within service life and undamaged"),
    critical("eye_face", "Eye and face protection is clean and undamaged"),
    critical("hearing", "Hearing protection is present and serviceable"),
    critical("chainsaw_protection", "Chainsaw protective clothing is undamaged when required"),
    item("high_visibility", "High-visibility clothing is present when required"),
    item("boots_gloves", "Boots and gloves are appropriate and serviceable"),
  ]),
];

export function getInspectionTemplate(key: string | null | undefined) {
  return equipmentInspectionTemplates.find((templateItem) => templateItem.key === key) ?? null;
}

function template(key: string, label: string, items: EquipmentInspectionItem[]): EquipmentInspectionTemplate {
  return { key, label, version: 1, items };
}

function item(key: string, label: string): EquipmentInspectionItem {
  return { key, label };
}

function critical(key: string, label: string): EquipmentInspectionItem {
  return { key, label, critical: true };
}
