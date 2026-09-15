"""Convert DeepMind/Janelia flybody MJCF + OBJ meshes into a hierarchical GLB.

Source: google-deepmind/mujoco_menagerie flybody (Apache-2.0).
Meshes stay parented to named body nodes so the fly can be posed in Three.js.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import trimesh
from trimesh.transformations import quaternion_matrix, translation_matrix

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / ".cache" / "mujoco_menagerie" / "flybody"
XML_PATH = SRC / "fruitfly.xml"
OUT_PATH = ROOT / "public" / "models" / "flybody.glb"

SKIP_CLASSES = {
    "collision",
    "adhesion-collision",
    "collision-membrane",
    "wing-fluid",
    "wing-inertial",
}

MESH_SCALE = np.array([0.1, 0.1, 0.1], dtype=np.float64)


def parse_vec(text: str | None, n: int, default: list[float]) -> np.ndarray:
    if not text:
        return np.array(default, dtype=np.float64)
    values = [float(part) for part in text.split()]
    if len(values) != n:
        raise ValueError(f"expected {n} numbers, got {text!r}")
    return np.array(values, dtype=np.float64)


def mj_quat_matrix(text: str | None) -> np.ndarray:
    # MuJoCo stores quaternions as w x y z.
    wxyz = parse_vec(text, 4, [1.0, 0.0, 0.0, 0.0])
    return quaternion_matrix(wxyz)


def body_matrix(element: ET.Element) -> np.ndarray:
    pos = parse_vec(element.get("pos"), 3, [0.0, 0.0, 0.0])
    return translation_matrix(pos) @ mj_quat_matrix(element.get("quat"))


def geom_matrix(element: ET.Element) -> np.ndarray:
    pos = parse_vec(element.get("pos"), 3, [0.0, 0.0, 0.0])
    if element.get("euler"):
        euler = parse_vec(element.get("euler"), 3, [0.0, 0.0, 0.0])
        rot = trimesh.transformations.euler_matrix(*euler, axes="sxyz")
        return translation_matrix(pos) @ rot
    return translation_matrix(pos) @ mj_quat_matrix(element.get("quat"))


def load_mesh(path: Path) -> trimesh.Trimesh:
    loaded = trimesh.load(path, force="mesh", process=True)
    if isinstance(loaded, trimesh.Scene):
        loaded = trimesh.util.concatenate(tuple(loaded.geometry.values()))
    if not isinstance(loaded, trimesh.Trimesh):
        raise TypeError(f"could not load mesh {path}")
    loaded.apply_scale(MESH_SCALE)
    loaded.remove_unreferenced_vertices()
    _ = loaded.vertex_normals
    return loaded


def should_skip_geom(geom: ET.Element) -> bool:
    if geom.get("mesh") is None:
        return True
    class_name = geom.get("class") or ""
    if class_name in SKIP_CLASSES:
        return True
    name = geom.get("name") or ""
    if "collision" in name or name.endswith("_fluid") or name.endswith("_inertial"):
        return True
    return False


def walk_bodies(
    parent: ET.Element,
    parent_name: str,
    scene: trimesh.Scene,
    meshes: dict[str, Path],
    mesh_cache: dict[str, trimesh.Trimesh],
) -> None:
    for body in parent.findall("body"):
        name = body.get("name")
        if not name:
            continue
        scene.graph.update(
            frame_to=name,
            frame_from=parent_name,
            matrix=body_matrix(body),
        )
        for geom in body.findall("geom"):
            if should_skip_geom(geom):
                continue
            mesh_name = geom.get("mesh")
            if mesh_name not in meshes:
                continue
            if mesh_name not in mesh_cache:
                mesh_cache[mesh_name] = load_mesh(meshes[mesh_name])
            geom_name = geom.get("name") or mesh_name
            node_name = f"geom_{geom_name}"
            scene.add_geometry(
                mesh_cache[mesh_name].copy(),
                geom_name=geom_name,
                node_name=node_name,
                parent_node_name=name,
                transform=geom_matrix(geom),
            )
        walk_bodies(body, name, scene, meshes, mesh_cache)


def main() -> None:
    tree = ET.parse(XML_PATH)
    root = tree.getroot()
    meshdir = SRC / (root.find("compiler").get("meshdir") if root.find("compiler") is not None else "assets")
    meshes: dict[str, Path] = {}
    for mesh in root.find("asset").findall("mesh"):
        name = mesh.get("name")
        filename = mesh.get("file")
        if name and filename:
            meshes[name] = meshdir / filename

    worldbody = root.find("worldbody")
    thorax = worldbody.find("body")
    if thorax is None or thorax.get("name") != "thorax":
        raise RuntimeError("expected thorax as the first worldbody child")

    scene = trimesh.Scene()
    scene.graph.update(frame_to="thorax", matrix=body_matrix(thorax))
    mesh_cache: dict[str, trimesh.Trimesh] = {}
    for geom in thorax.findall("geom"):
        if should_skip_geom(geom):
            continue
        mesh_name = geom.get("mesh")
        if mesh_name not in meshes:
            continue
        if mesh_name not in mesh_cache:
            mesh_cache[mesh_name] = load_mesh(meshes[mesh_name])
        geom_name = geom.get("name") or mesh_name
        scene.add_geometry(
            mesh_cache[mesh_name].copy(),
            geom_name=geom_name,
            node_name=f"geom_{geom_name}",
            parent_node_name="thorax",
            transform=geom_matrix(geom),
        )
    walk_bodies(thorax, "thorax", scene, meshes, mesh_cache)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    scene.export(OUT_PATH)
    print(f"wrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1e6:.1f} MB)")
    print(f"nodes={len(scene.graph.nodes)} geometries={len(scene.geometry)}")


if __name__ == "__main__":
    main()
