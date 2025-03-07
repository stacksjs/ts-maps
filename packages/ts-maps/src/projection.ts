/**
 * ------------------------------------------------------------------------
 * Object
 * ------------------------------------------------------------------------
 */
interface Point {
  x: number
  y: number
}

interface Projection {
  mill: (lat: number, lng: number, c: number) => Point
  merc: (lat: number, lng: number, c: number) => Point
  aea: (lat: number, lng: number, c: number) => Point
  lcc: (lat: number, lng: number, c: number) => Point
  degRad: number
  radDeg: number
  radius: number
}

const Proj: Projection = {

  /* sgn(n){
    if (n > 0) {
      return 1;
    } else if (n < 0) {
      return -1;
    } else {
      return n;
    }
  }, */

  mill(lat: number, lng: number, c: number): Point {
    return {
      x: this.radius * (lng - c) * this.radDeg,
      y: -this.radius * Math.log(Math.tan((45 + 0.4 * lat) * this.radDeg)) / 0.8,
    }
  },

  /* mill_inv(x, y, c) {
    return {
      lat: (2.5 * Math.atan(Math.exp(0.8 * y / this.radius)) - 5 * Math.PI / 8) * this.degRad,
      lng: (c * this.radDeg + x / this.radius) * this.degRad
    };
  }, */

  merc(lat: number, lng: number, c: number): Point {
    return {
      x: this.radius * (lng - c) * this.radDeg,
      y: -this.radius * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)),
    }
  },

  /* merc_inv(x, y, c) {
    return {
      lat: (2 * Math.atan(Math.exp(y / this.radius)) - Math.PI / 2) * this.degRad,
      lng: (c * this.radDeg + x / this.radius) * this.degRad
    };
  }, */

  aea(lat: number, lng: number, c: number): Point {
    const fi0 = 0
    const lambda0 = c * this.radDeg
    const fi1 = 29.5 * this.radDeg
    const fi2 = 45.5 * this.radDeg
    const fi = lat * this.radDeg
    const lambda = lng * this.radDeg
    const n = (Math.sin(fi1) + Math.sin(fi2)) / 2
    const C = Math.cos(fi1) * Math.cos(fi1) + 2 * n * Math.sin(fi1)
    const theta = n * (lambda - lambda0)
    const ro = Math.sqrt(C - 2 * n * Math.sin(fi)) / n
    const ro0 = Math.sqrt(C - 2 * n * Math.sin(fi0)) / n

    return {
      x: ro * Math.sin(theta) * this.radius,
      y: -(ro0 - ro * Math.cos(theta)) * this.radius,
    }
  },

  /* aea_inv(xCoord, yCoord, c) {
    var x = xCoord / this.radius,
        y = yCoord / this.radius,
        fi0 = 0,
        lambda0 = c * this.radDeg,
        fi1 = 29.5 * this.radDeg,
        fi2 = 45.5 * this.radDeg,
        n = (Math.sin(fi1)+Math.sin(fi2)) / 2,
        C = Math.cos(fi1)*Math.cos(fi1)+2*n*Math.sin(fi1),
        ro0 = Math.sqrt(C-2*n*Math.sin(fi0))/n,
        ro = Math.sqrt(x*x+(ro0-y)*(ro0-y)),
        theta = Math.atan( x / (ro0 - y) );

    return {
      lat: (Math.asin((C - ro * ro * n * n) / (2 * n))) * this.degRad,
      lng: (lambda0 + theta / n) * this.degRad
    };
  }, */

  lcc(lat: number, lng: number, c: number): Point {
    const fi0 = 0
    const lambda0 = c * this.radDeg
    const lambda = lng * this.radDeg
    const fi1 = 33 * this.radDeg
    const fi2 = 45 * this.radDeg
    const fi = lat * this.radDeg
    const n = Math.log(Math.cos(fi1) * (1 / Math.cos(fi2))) / Math.log(Math.tan(Math.PI / 4 + fi2 / 2) * (1 / Math.tan(Math.PI / 4 + fi1 / 2)))
    const F = (Math.cos(fi1) * Math.tan(Math.PI / 4 + fi1 / 2) ** n) / n
    const ro = F * (1 / Math.tan(Math.PI / 4 + fi / 2)) ** n
    const ro0 = F * (1 / Math.tan(Math.PI / 4 + fi0 / 2)) ** n

    return {
      x: ro * Math.sin(n * (lambda - lambda0)) * this.radius,
      y: -(ro0 - ro * Math.cos(n * (lambda - lambda0))) * this.radius,
    }
  },

  /* lcc_inv(xCoord, yCoord, c) {
    var x = xCoord / this.radius,
        y = yCoord / this.radius,
        fi0 = 0,
        lambda0 = c * this.radDeg,
        fi1 = 33 * this.radDeg,
        fi2 = 45 * this.radDeg,
        n = Math.log( Math.cos(fi1) * (1 / Math.cos(fi2)) ) / Math.log( Math.tan( Math.PI / 4 + fi2 / 2) * (1 / Math.tan( Math.PI / 4 + fi1 / 2) ) ),
        F = ( Math.cos(fi1) * Math.pow( Math.tan( Math.PI / 4 + fi1 / 2 ), n ) ) / n,
        ro0 = F * Math.pow( 1 / Math.tan( Math.PI / 4 + fi0 / 2 ), n ),
        ro = this.sgn(n) * Math.sqrt(x*x+(ro0-y)*(ro0-y)),
        theta = Math.atan( x / (ro0 - y) );

    return {
      lat: (2 * Math.atan(Math.pow(F/ro, 1/n)) - Math.PI / 2) * this.degRad,
      lng: (lambda0 + theta / n) * this.degRad
    };
  } */

  degRad: 180 / Math.PI,
  radDeg: Math.PI / 180,
  radius: 6381372,
}

export default Proj
