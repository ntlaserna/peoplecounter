SELECT *
FROM (
	SELECT *
	FROM WifiSSIDPacket p
	ORDER BY time DESC
	LIMIT :limit
) p
INNER JOIN MACAddress a
	ON (p.macId = a.macId)
INNER JOIN OUI o
	ON (a.ouiId = o.ouiId);