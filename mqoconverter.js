var MqoConverter = {};

/**
 *
 * @param mqo
 * @param options
 * @returns {Geometry}
 */
MqoConverter.toTHREEJS_Geometry = (mqo, options = {}) => {
  const scale = options.scale || 0.01;
  const positions = [];
  const uvs = [];
  const groups = [];

  let start = 0;
  let count = 0;

  mqo.meshes.forEach(mqoMesh => {
    const {faces, vertices} = mqoMesh;

    if (faces.length === 0)
      return;

    let materialIndex = faces[0].m[0];

    // indices と uv を作成
    faces.forEach(face => {
      const {m, v, uv, vNum} = face;

      if (materialIndex !== m[0]) {
        groups.push({start, count, materialIndex});
        materialIndex = m[0];
        start += count;
        count = 0;
      }

      if (vNum === 3) {
        // 頂点インデックス
        positions.push(
          ...vertices[v[2]],
          ...vertices[v[1]],
          ...vertices[v[0]]
        );

        // UV
        uvs.push(
          uv[4], 1.0 - uv[5],
          uv[2], 1.0 - uv[3],
          uv[0], 1.0 - uv[1]
        );

        count += 3;
      } else if (vNum === 4) {
        positions.push(
          ...vertices[v[3]],
          ...vertices[v[2]],
          ...vertices[v[1]],

          ...vertices[v[1]],
          ...vertices[v[0]],
          ...vertices[v[3]]
        );

        // UV
        uvs.push(
          uv[6], 1.0 - uv[7],
          uv[4], 1.0 - uv[5],
          uv[2], 1.0 - uv[3],

          uv[2], 1.0 - uv[3],
          uv[0], 1.0 - uv[1],
          uv[6], 1.0 - uv[7]
        );

        count += 6;
      } else {
        // n-gon
        for (let i = 1, l = vNum - 1; i < l; i++) {
          positions.push(
            ...vertices[v[i + 1]],
            ...vertices[v[i]],
            ...vertices[v[0]]
          );

          uvs.push(
            uv[(i + 1) * 2], 1.0 - uv[(i + 1) * 2 + 1],
            uv[i * 2],       1.0 - uv[i * 2 + 1],
            uv[0],           1.0 - uv[1]
          );

          count += 3;
        }
      }
    });

    groups.push({start, count, materialIndex});
    start += count;
    count = 0;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.map(v => v * scale), 3));
  geometry.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geometry.groups = groups;

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();

  return geometry;
};

/**
 *
 * @param mqoMaterials
 * @param options
 * @returns {Array|*|dojo|NodeList}
 */
MqoConverter.generateMaterials = (mqoMaterials, options = {}) => {
  var texturePath = options.texturePath || '.';
  var bumpScale   = options.bumpScale   || 1;

  // マテリアルリスト
  return mqoMaterials.map(mqoMaterial => {
    var material = null;
    if (mqoMaterial.shader == 2) {
      material = new THREE.MeshLambertMaterial();
    } else if (mqoMaterial.shader == 3) {
      material = new THREE.MeshPhongMaterial();
    } else {
      material = new THREE.MeshBasicMaterial();
    }

    if (material.color) {
      material.color.setRGB(
        mqoMaterial.col[0] * mqoMaterial.dif,
        mqoMaterial.col[1] * mqoMaterial.dif,
        mqoMaterial.col[2] * mqoMaterial.dif
      );
    }

    if (material.emissive) {
      material.emissive.setRGB(
        mqoMaterial.col[0] * mqoMaterial.emi,
        mqoMaterial.col[1] * mqoMaterial.emi,
        mqoMaterial.col[2] * mqoMaterial.emi
      );
    }

    if (material.ambient) {
      material.ambient.setRGB(
        mqoMaterial.col[0] * mqoMaterial.amb,
        mqoMaterial.col[1] * mqoMaterial.amb,
        mqoMaterial.col[2] * mqoMaterial.amb
      );
    }

    if (material.specular) {
      material.specular.setRGB(
        mqoMaterial.col[0] * mqoMaterial.spc,
        mqoMaterial.col[1] * mqoMaterial.spc,
        mqoMaterial.col[2] * mqoMaterial.spc
      );
    }

    if (mqoMaterial.tex) {
      material.map = new THREE.TextureLoader().load(texturePath + '/' + mqoMaterial.tex);
      material.map.wrapS = material.map.wrapT = THREE.RepeatWrapping;
    }

    if (mqoMaterial.bump) {
      material.bumpMap = new THREE.TextureLoader().load(texturePath + '/' + mqoMaterial.bump);
      material.bumpMap.wrapS = material.bumpMap.wrapT = THREE.RepeatWrapping;
      material.bumpScale = bumpScale;
    }

    material.transparent = true;
    material.shiness = mqoMaterial.power;
    material.opacity = mqoMaterial.col[3];

    return material;
  });
};

/**
 * 圧縮されたOBJECTを返す
 * @param mqo
 * @param scale
 * @returns {{materials: (THREE.JSONLoader.parse.materials|*|materials|Array|.materials.materials|THREE.MeshFaceMaterial.materials), vertices: (Array|*), faces: (Array|*), uv: (Array|*|dojo|NodeList)}}
 */
MqoConverter.toCompressedObject = (mqo, scale) => {
  var geometry = new THREE.Geometry();
  mqo.meshes.forEach(mqoMesh => {
    geometry.merge(MqoConverter.generateGeometry(mqoMesh, scale));
  });

  return {
    materials: mqo.materials,
    vertices: geometry.vertices.map(v => ({
      p: [v.x, v.y, v.z],
      i: [0, 0, 0, 0],
      w: [1, 0, 0, 0]
    })),

    faces: geometry.faces.map(face => ({
      a: face.a,
      b: face.b,
      c: face.c,
      m: face.materialIndex,
      n: [face.normal.x, face.normal.y, face.normal.z]
    })),

    uv: geometry.faceVertexUvs[0].map(uv => [
      [uv[0].x, uv[0].y],
      [uv[1].x, uv[1].y],
      [uv[2].x, uv[2].y]
    ])
  };
};

if (typeof exports !== 'undefined') {
  if (typeof module !== 'undefined' && module.exports) {
    exports = module.exports = MqoConverter;
  }
  exports.MqoConverter = MqoConverter;
} else {
  this['MqoConverter'] = MqoConverter;
}
