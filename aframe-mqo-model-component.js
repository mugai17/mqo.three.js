/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

	if (typeof AFRAME === 'undefined') {
		throw new Error('Component attempted to register before AFRAME was available.');
	}

	const MqoParser    = __webpack_require__(1);
	const MqoConverter = __webpack_require__(2);

	AFRAME.registerComponent('mqo-model', {
		schema: {
			src         : {type: 'asset'},
			texturePath : {type: 'string', default: '.'},
			bumpScale   : {type: 'number', default: 1}
		},

		init() {
			this.model = null;
		},

		update(oldData) {
			var self        = this,
			    el          = this.el,
			    src         = this.data.src,
			    texturePath = this.data.texturePath,
			    bumpScale   = this.data.bumpScale;

			if (!src)
				return;

			MqoParser.load(src, (mqo) => {
				var geometry  = MqoConverter.toTHREEJS_Geometry(mqo, {scale: 0.01});
				var materials = MqoConverter.generateMaterials(mqo.materials, {texturePath: texturePath, bumpScale: bumpScale});

				self.model = new THREE.Mesh(geometry, materials);

				el.setObject3D('mesh', self.model);
				el.emit('model-loaded', {format: 'mqo', model: self.model});
			});
		},

		remove() {
			if (!this.model)
				return;

			this.el.removeObject3D('mesh');
		}
	});

	var extendDeep = AFRAME.utils.extendDeep;
	var meshMixin  = AFRAME.primitives.getMeshMixin();

	AFRAME.registerPrimitive('a-mqo-model', extendDeep({}, meshMixin, {
		mappings: {
			'src'          : 'mqo-model.src',
			'texture-path' : 'mqo-model.texturePath',
			'bump-scale'   : 'mqo-model.bumpScale'
		}
	}));


/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

	var MqoParser = {};

	MqoParser.load = (url, callback) => {
	  new THREE.FileLoader().load(url, (text) => {
	    var mqo = MqoParser.parse(text);
	    if (callback)
	      callback(mqo);
	  });
	};

	MqoParser.parse = (text) => {
	  var mqo = new Mqo();
	  mqo.parse(text);
	  return mqo;
	};

	class Mqo {
	  constructor() {
	    this.meshes    = [];
	    this.materials = [];
	  }

	  parse(text) {
	    // オブジェクトをパース
	    var objectTextList = text.match(/^Object [\s\S]*?^\}/gm);

	    objectTextList.forEach(objectText => {
	      var mesh = new MqoMesh().parse(objectText);
	      if (mesh.visible)
	        this.meshes.push(mesh);
	    });

	    // マテリアル
	    var materialText = text.match(/^Material [\s\S]*?^\}/m);
	    if (materialText)
	      this.materials = this._parseMaterials(materialText[0]);

	    return this;
	  }

	  /**
	  * メタセコ用マテリアル
	  */
	  _parseMaterials(text) {
	    var infoText = text.match(/^Material [0-9]* \{\r\n([\s\S]*?)\n^\}$/m);
	    var matTextList = infoText[1].split('\n');

	    var materials = matTextList.map(matText => {
	      var mat = {};
	      // トリムっとく
	      matText = matText.replace(/^\s+|\s+$/g, '');
	      var info = matText.match(/([A-Za-z]+)\(([\w\W]+?)\)/gi);

	      info.forEach(infoText => {
	        var m = infoText.match(/([A-Za-z]+)\(([\w\W]+?)\)/);
	        var key = m[1].toLowerCase();

	        switch (key) {
	          case 'tex':
	          case 'aplane':
	          case 'bump':
	            mat[key] = m[2].replace(/"/g, '');
	            break;
	          default:
	            mat[key] = m[2].split(' ').map(val => Number(val));
	        }
	      });
	      return mat;
	    });

	    return materials;
	  }
	}

	/**
	* メタセコメッシュ
	*/
	class MqoMesh {
	  constructor() {
	    this.name       = '';	// 名前
	    this.vertices   = [];	// 頂点
	    this.faces      = [];	// 面情報
	    this.vertNorms  = [];	// 頂点法線

	    this.facet      = 59.5;	// スムージング角度
	    this.depth      = 0;	// 階層の深さ
	    this.mirror     = 0;
	    this.mirrorAxis = 0;
	    this.visible    = true;
	  }

	  parse(text) {
	    // 0: 非表示, 15: 表示
	    var visible = text.match(/visible (\d+)$/m);
	    if (visible && visible[1] === '0') {
	      this.visible = false;
	      return this;
	    }

	    // 名前
	    var name = text.match(/^Object[\s\S]+\"([^\"]+)?\"/);
	    if (name)
	      this.name = name[1];

	    // スムージング角
	    var facet = text.match(/facet ([0-9\.]+)/);
	    if (facet)
	      this.facet = Number(facet[1]);

	    // 階層の深さ
	    var depth = text.match(/depth ([0-9\.]+)/);
	    if (depth)
	      this.depth = Number(depth[1]);

	    // ミラー
	    var mirror = text.match(/mirror ([0-9])/m);
	    if (mirror) {
	      this.mirror = Number(mirror[1]);
	      // 軸
	      var mirrorAxis = text.match(/mirror_axis ([0-9])/m);
	      if (mirrorAxis)
	        this.mirrorAxis = Number(mirrorAxis[1]);
	    }

	    var vertex_txt = text.match(/vertex ([0-9]+).+\{\s([\w\W]+)}$/gm);
	    this._parseVertices(RegExp.$1, RegExp.$2);

	    var face_txt = text.match(/face ([0-9]+).+\{\s([\w\W]+)}$/gm);
	    this._parseFaces(RegExp.$1, RegExp.$2);

	    return this;
	  }

	  _parseVertices(num, text) {
	    var vertexTextList = text.split('\n');
	    for (var i = 1; i <= num; ++i) {
	      var vertex = vertexTextList[i].split(' ').map(val => Number(val));
	      this.vertices.push(vertex);
	    }

	    if (this.mirror) {
	      var toMirror = {
	        1: (v) => [v[0] * -1, v[1], v[2]],
	        2: (v) => [v[0], v[1] * -1, v[2]],
	        4: (v) => [v[0], v[1], v[2] * -1]
	      }[this.mirrorAxis];

	      this.vertices.forEach(vertex => {
	        this.vertices.push(toMirror(vertex));
	      });
	    }
	  }

	  _parseFaces(num, text) {
	    var faceTextList = text.split('\n');

	    var calcNormalize = (a, b, c) => {
	      var v1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
	      var v2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
	      var v3 = [
	        v1[1] * v2[2] - v1[2] * v2[1],
	        v1[2] * v2[0] - v1[0] * v2[2],
	        v1[0] * v2[1] - v1[1] * v2[0]
	      ];
	      var len = Math.sqrt(v3[0] * v3[0] + v3[1] * v3[1] + v3[2] * v3[2]);

	      if (len === 0)
	        return [0, 0, 0];

	      v3[0] /= len;
	      v3[1] /= len;
	      v3[2] /= len;

	      return v3;
	    };

	    for (var i = 1; i <= num; ++i) {
	      // トリムっとく
	      var faceText = faceTextList[i].replace(/^\s+|\s+$/g, '');
	      // 面の数
	      var vertex_num = Number(faceText[0]);

	      var info = faceText.match(/([A-Za-z]+)\(([\w\s\-\.\(\)]+?)\)/gi);
	      var face = {
	        m    : [undefined],			// マテリアル デフォルト値
	        uv   : [0, 0, 0, 0, 0, 0, 0, 0],	// UV デフォルト値
	        vNum : vertex_num
	      };

	      info.forEach(infoText => {
	        var m = infoText.match(/([A-Za-z]+)\(([\w\s\-\.\(\)]+?)\)/);
	        var key = m[1].toLowerCase();
	        face[key] = m[2].split(' ').map(val => Number(val));
	      });

	      // 法線計算
	      if (face.v.length === 3) {
	        face.n = calcNormalize(this.vertices[face.v[0]], this.vertices[face.v[1]], this.vertices[face.v[2]]);
	      } else if (face.v.length === 4) {
	        var n1 = calcNormalize(this.vertices[face.v[0]], this.vertices[face.v[1]], this.vertices[face.v[2]]);
	        var n2 = calcNormalize(this.vertices[face.v[2]], this.vertices[face.v[3]], this.vertices[face.v[0]]);
	        face.n = [
	          (n1[0] + n2[0]) * 0.5,
	          (n1[1] + n2[1]) * 0.5,
	          (n1[2] + n2[2]) * 0.5
	        ];
	      } else {
	        face.n = [0, 0, 0];
	      }

	      this.faces.push(face);
	    }

	    // ミラー対応
	    if (this.mirror) {
	      var swap = function (a, b) { var temp = this[a]; this[a] = this[b]; this[b] = temp; return this; };
	      var vertexOffset = (this.vertices.length / 2);
	      this.faces.forEach(targetFace => {
	        var face = {
	          m    : targetFace.m,
	          n    : targetFace.n,
	          uv   : [...targetFace.uv],
	          v    : targetFace.v.map(val => val + vertexOffset),
	          vNum : targetFace.vNum
	        };

	        if (face.vNum === 3) {
	          swap.call(face.v,  1, 2);
	          swap.call(face.uv, 2, 4);
	          swap.call(face.uv, 3, 5);
	        } else if (face.vNum === 4) {
	          swap.call(face.v,  0, 1);
	          swap.call(face.uv, 0, 2);
	          swap.call(face.uv, 1, 3);

	          swap.call(face.v,  2, 3);
	          swap.call(face.uv, 4, 6);
	          swap.call(face.uv, 5, 7);
	        }

	        this.faces.push(face);
	      });
	    }

	    // 頂点法線を求める
	    var vertNorm = this.vertices.map(() => []);

	    this.faces.forEach(face => {
	      var vIndices = face.v;

	      for (var j = 0; j < face.vNum; ++j) {
	        var index = vIndices[j];
	        vertNorm[index].push(face.n);
	      }
	    });

	    this.vertNorms = vertNorm.map(vn => {
	      var result = [0, 0, 0];
	      var len = vn.length;
	      for (var j = 0; j < len; ++j) {
	        result[0] += vn[j][0];
	        result[1] += vn[j][1];
	        result[2] += vn[j][2];
	      }

	      result[0] /= len;
	      result[1] /= len;
	      result[2] /= len;

	      var len = Math.sqrt(result[0] * result[0] + result[1] * result[1] + result[2] * result[2]);
	      result[0] /= len;
	      result[1] /= len;
	      result[2] /= len;

	      return result;
	    });
	  }
	}

	if (true) {
	  if (typeof module !== 'undefined' && module.exports) {
	    exports = module.exports = MqoParser;
	  }
	  exports.MqoParser = MqoParser;
	} else {
	  this['MqoParser'] = MqoParser;
	}


/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

	var MqoConverter = {};

	/**
	 *
	 * @param mqo
	 * @param options
	 * @returns {Geometry}
	 */
	MqoConverter.toTHREEJS_Geometry = (mqo, options = {}) => {
	  var scale = options.scale || 0.01;

	  var geometry = new THREE.Geometry();
	  mqo.meshes.forEach(mqoMesh => {
	    geometry.merge(MqoConverter.generateGeometry(mqoMesh, scale));
	  });

	//geometry.computeCentroids();
	  geometry.computeBoundingBox();
	  geometry.computeFaceNormals();
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
	 *
	 * @param mqoMesh
	 * @param scale
	 * @returns {Geometry}
	 */
	MqoConverter.generateGeometry = (mqoMesh, scale) => {
	  var geometry = new THREE.Geometry();
	  mqoMesh.vertices.forEach(vertex => {
	    geometry.vertices.push(new THREE.Vector3(
	      vertex[0] * scale,
	      vertex[1] * scale,
	      vertex[2] * scale
	    ));
	  });

	  // チェック
	  var smoothingValue = Math.cos(mqoMesh.facet * Math.PI / 180);
	  var checkVertexNormalize = (n, vn) => {
	    var c = n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2];
	    return (c > smoothingValue) ? vn : n;
	  };

	  // indices と uv を作成
	  mqoMesh.faces.forEach(face => {
	    var vIndex = face.v;
	    var index = geometry.vertices.length;

	    if (face.vNum == 3) {
	      // 頂点インデックス
	      var face3 = new THREE.Face3(vIndex[2], vIndex[1], vIndex[0], undefined, undefined, face.m[0]);
	      geometry.faces.push(face3);

	      // 法線
	      var n = face.n;
	      var tn = [];
	      for (var j = 0; j < 3; ++j) {
	        var vn = mqoMesh.vertNorms[vIndex[j]];
	        tn.push(checkVertexNormalize(n, vn));
	      }

	      face3.normal.x = n[0];
	      face3.normal.y = n[1];
	      face3.normal.z = n[2];

	      face3.vertexNormals.push(new THREE.Vector3(tn[2][0], tn[2][1], tn[2][2]));
	      face3.vertexNormals.push(new THREE.Vector3(tn[1][0], tn[1][1], tn[1][2]));
	      face3.vertexNormals.push(new THREE.Vector3(tn[0][0], tn[0][1], tn[0][2]));

	      // UV
	      geometry.faceVertexUvs[0].push([
	        new THREE.Vector2(face.uv[4], 1.0 - face.uv[5]),
	        new THREE.Vector2(face.uv[2], 1.0 - face.uv[3]),
	        new THREE.Vector2(face.uv[0], 1.0 - face.uv[1])
	      ]);
	    } else if (face.vNum == 4) {
	      // 法線
	      var n = face.n;
	      var tn = [];
	      for (var j = 0; j < 4; ++j) {
	        var vn = mqoMesh.vertNorms[vIndex[j]];
	        tn.push(checkVertexNormalize(n, vn));
	      }

	      var face3 = new THREE.Face3(vIndex[3], vIndex[2], vIndex[1], undefined, undefined, face.m[0]);
	      geometry.faces.push(face3);

	      face3.normal.x = n[0];
	      face3.normal.y = n[1];
	      face3.normal.z = n[2];

	      face3.vertexNormals.push(new THREE.Vector3(tn[3][0], tn[3][1], tn[3][2]));
	      face3.vertexNormals.push(new THREE.Vector3(tn[2][0], tn[2][1], tn[2][2]));
	      face3.vertexNormals.push(new THREE.Vector3(tn[1][0], tn[1][1], tn[1][2]));

	      // UV
	      geometry.faceVertexUvs[0].push([
	        new THREE.Vector2(face.uv[6], 1.0 - face.uv[7]),
	        new THREE.Vector2(face.uv[4], 1.0 - face.uv[5]),
	        new THREE.Vector2(face.uv[2], 1.0 - face.uv[3])
	      ]);

	      var face3 = new THREE.Face3(vIndex[1], vIndex[0], vIndex[3], undefined, undefined, face.m[0]);
	      geometry.faces.push(face3);

	      face3.normal.x = n[0];
	      face3.normal.y = n[1];
	      face3.normal.z = n[2];

	      face3.vertexNormals.push(new THREE.Vector3(tn[1][0], tn[1][1], tn[1][2]));
	      face3.vertexNormals.push(new THREE.Vector3(tn[0][0], tn[0][1], tn[0][2]));
	      face3.vertexNormals.push(new THREE.Vector3(tn[3][0], tn[3][1], tn[3][2]));

	      // UV
	      geometry.faceVertexUvs[0].push([
	        new THREE.Vector2(face.uv[2], 1.0 - face.uv[3]),
	        new THREE.Vector2(face.uv[0], 1.0 - face.uv[1]),
	        new THREE.Vector2(face.uv[6], 1.0 - face.uv[7])
	      ]);
	    }
	  });

	  return geometry;
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

	if (true) {
	  if (typeof module !== 'undefined' && module.exports) {
	    exports = module.exports = MqoConverter;
	  }
	  exports.MqoConverter = MqoConverter;
	} else {
	  this['MqoConverter'] = MqoConverter;
	}


/***/ })
/******/ ]);