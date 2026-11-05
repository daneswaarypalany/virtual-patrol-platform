import net from 'node:net';

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data.ec2.internal',
]);

const BLOCKED_IPV4 = new net.BlockList();

BLOCKED_IPV4.addSubnet('0.0.0.0', 8, 'ipv4');
BLOCKED_IPV4.addSubnet('127.0.0.0', 8, 'ipv4');
BLOCKED_IPV4.addSubnet('169.254.0.0', 16, 'ipv4');
BLOCKED_IPV4.addSubnet('224.0.0.0', 4, 'ipv4');

const BLOCKED_IPV6 = new net.BlockList();

BLOCKED_IPV6.addAddress('::', 'ipv6');
BLOCKED_IPV6.addAddress('::1', 'ipv6');
BLOCKED_IPV6.addSubnet('fe80::', 10, 'ipv6');
BLOCKED_IPV6.addSubnet('ff00::', 8, 'ipv6');
BLOCKED_IPV6.addSubnet('::ffff:0:0', 96, 'ipv6');

function parseCidrs(values) {
  const networks = {
    ipv4: new net.BlockList(),
    ipv6: new net.BlockList(),
  };

  for (const value of values || []) {
    const entry = value.trim();

    if (!entry) continue;

    const separator = entry.lastIndexOf('/');

    if (separator < 1) {
      throw new Error(
        `Invalid CAMERA_ALLOWED_CIDRS entry: ${entry}`
      );
    }

    const address = entry.slice(0, separator);
    const prefix = Number(entry.slice(separator + 1));
    const ipVersion = net.isIP(address);

    const maximumPrefix =
      ipVersion === 4 ? 32 : ipVersion === 6 ? 128 : -1;

    if (
      !ipVersion ||
      !Number.isInteger(prefix) ||
      prefix < 0 ||
      prefix > maximumPrefix
    ) {
      throw new Error(
        `Invalid CAMERA_ALLOWED_CIDRS entry: ${entry}`
      );
    }

    networks[ipVersion === 4 ? 'ipv4' : 'ipv6'].addSubnet(
      address,
      prefix,
      ipVersion === 4 ? 'ipv4' : 'ipv6'
    );
  }

  return networks;
}

function isBlockedIp(hostname, ipVersion) {
  if (ipVersion === 4) {
    return BLOCKED_IPV4.check(hostname, 'ipv4');
  }

  if (ipVersion === 6) {
    return BLOCKED_IPV6.check(hostname, 'ipv6');
  }

  return false;
}

export function validateRtspSource(
  rawUrl,
  allowedHosts = [],
  allowedCidrs = []
) {
  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('The camera source is not a valid URL');
  }

  if (!['rtsp:', 'rtsps:'].includes(parsed.protocol)) {
    throw new Error(
      'Only RTSP and RTSPS sources can be provisioned by this agent'
    );
  }

  if (!parsed.hostname || parsed.hash) {
    throw new Error('The camera source URL is incomplete');
  }

  const hostname = parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (BLOCKED_HOSTS.has(hostname)) {
    throw new Error('The camera host is not allowed');
  }

  const ipVersion = net.isIP(hostname);

  if (isBlockedIp(hostname, ipVersion)) {
    throw new Error('The camera host is not allowed');
  }

  const hostAllowlist = new Set(
    (allowedHosts || [])
      .map((host) =>
        host.trim().toLowerCase().replace(/\.$/, '')
      )
      .filter(Boolean)
  );

  const networks = parseCidrs(allowedCidrs);

  const explicitlyAllowed = hostAllowlist.has(hostname);

  const allowedByNetwork =
    ipVersion === 4
      ? networks.ipv4.check(hostname, 'ipv4')
      : ipVersion === 6
        ? networks.ipv6.check(hostname, 'ipv6')
        : false;

  if (!explicitlyAllowed && !allowedByNetwork) {
    throw new Error(
      'The camera host is outside this site agent allowed hosts and networks'
    );
  }

  return parsed;
}

export function validateStreamPath(value) {
  if (
    typeof value !== 'string' ||
    !/^camera_[a-zA-Z0-9]{16,64}$/.test(value)
  ) {
    throw new Error(
      'Provisioning job contained an invalid stream path'
    );
  }

  return value;
}