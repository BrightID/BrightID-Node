/** 
  -- WISchnorrServer.js -- 
  Author : Christof Torres <christof.ferreira.001@student.uni.lu>
  Date   : September 2016
**/

var CryptoJS = require("crypto-js");
var BigInteger = require("jsbn").BigInteger;
const { modPow } = require("./encoding");

BigInteger.prototype.remoteModPow = function remoteModPow(exp, b) {
	return modPow(this, exp, b);
};

function sha256(s) {
	return new BigInteger(CryptoJS.SHA256(s).toString(CryptoJS.enc.Hex), 16);
}

/* Initializes the WISchnorServer */
function WISchnorrServer() {
	/* Discrete Logarithm Generator (DLG) */
	this.q = new BigInteger("2");
	var w = new BigInteger("2");

	// q = 2^256 - 2^168 + 1
	this.q = this.q.pow(256); // q = 2^256
	this.q = this.q.subtract(new BigInteger("2").pow(168)); // q = 2^256 - 2^168
	this.q = this.q.add(new BigInteger("1")); // q = 2^256 - 2^168 + 1

	// w = 2^2815 + 231
	w = w.pow(2815); // w = 2^2815
	w = w.add(new BigInteger("231")); // w = 2^2815 + 231

	// p = 2wq + 1
	this.p = w.multiply(this.q); // p = wq
	this.p = this.p.multiply(new BigInteger("2")); // p = 2wq
	this.p = this.p.add(new BigInteger("1")); // p = 2wq + 1

	// g = 2^2w mod p
	this.g = new BigInteger("2").remoteModPow(w.multiply(new BigInteger("2")), this.p);
}

/* Generates a Schnorr keypair: y = g^x mod q */
WISchnorrServer.prototype.GenerateSchnorrKeypair = function (password) {
	// Hashed password (SHA-256)
	var hash = sha256(password);

	// Private key
	// x = hash mod q
	this.x = hash.mod(this.q);

	// Public key
	// y = g^x mod p
	this.y = this.g.remoteModPow(this.x, this.p);

	return { y: this.y, x: this.x };
};

/* Extracts the public key of the Schnorr scheme */
WISchnorrServer.prototype.ExtractPublicKey = function () {
	return {
		p: this.p.toString(),
		q: this.q.toString(),
		g: this.g.toString(),
		y: this.y.toString(),
	};
};

/* Generates a cryptographically secure random number modulo q */
WISchnorrServer.prototype.GenerateRandomNumber = function () {
	var bytes = Math.floor(Math.random() * (this.q.bitLength() / 8 - 1 + 1)) + 1;
	const r = CryptoJS.lib.WordArray.random(bytes);
	const rhex = CryptoJS.enc.Hex.stringify(r);
	return new BigInteger(rhex, 16).mod(this.q);
};

/* Generates the serverside private parameters and the serverside public 
   parameters 'a' and 'b' for the client */
WISchnorrServer.prototype.GenerateWISchnorrParams = function (info) {
	var u = this.GenerateRandomNumber();
	var s = this.GenerateRandomNumber();
	var d = this.GenerateRandomNumber();

	var F = sha256(info);
	// z = F^((p-1)/q) mod p
	var z = F.remoteModPow(this.p.subtract(new BigInteger("1")).divide(this.q), this.p);

	// a = g^u mod p
	var a = this.g.remoteModPow(u, this.p);

	// b = (g^s * z^d) mod p
	var b = this.g.remoteModPow(s, this.p).multiply(z.remoteModPow(d, this.p)).mod(this.p);

	return {
		private: { u: u, s: s, d: d },
		public: { a: a.toString(), b: b.toString() },
	};
};

/* Generates the server response based on the challenge received from the client */
WISchnorrServer.prototype.GenerateWISchnorrServerResponse = function (
	params,
	e
) {
	e = new BigInteger(e);

	// c = e − d mod q
	var c = e.subtract(params.d).mod(this.q);

	// r = u − cx mod q
	var r = params.u.subtract(c.multiply(this.x)).mod(this.q);

	return {
		r: r.toString(),
		c: c.toString(),
		s: params.s.toString(),
		d: params.d.toString(),
	};
};

/* Verifies a WISchnorr partially blind signature */
WISchnorrServer.prototype.VerifyWISchnorrBlindSignature = function (
	signature,
	info,
	msg
) {
	var F = sha256(info);
	// z = F^((p-1)/q) mod p
	var z = F.remoteModPow(this.p.subtract(new BigInteger("1")).divide(this.q), this.p);

	// g^rho mod p
	var gp = this.g.remoteModPow(new BigInteger(signature.rho), this.p);
	// y^omega mod p
	var yw = this.y.remoteModPow(new BigInteger(signature.omega), this.p);
	// g^rho * y^omega mod p
	var gpyw = gp.multiply(yw).mod(this.p);

	// g^sigma mod p
	var gs = this.g.remoteModPow(new BigInteger(signature.sigma), this.p);
	// z^delta mod p
	var zd = z.remoteModPow(new BigInteger(signature.delta), this.p);
	// g^sigma * z^delta mod p
	var gszd = gs.multiply(zd).mod(this.p);

	var H = sha256(gpyw.toString() + gszd.toString() + z.toString() + msg);
	// hsig = H mod q
	var hsig = H.mod(this.q);

	// vsig = omega + delta mod q
	var vsig = new BigInteger(signature.omega)
		.add(new BigInteger(signature.delta))
		.mod(this.q);

	if (vsig.compareTo(hsig) === 0) {
		return true;
	} else {
		return false;
	}
};

module.exports = WISchnorrServer;
