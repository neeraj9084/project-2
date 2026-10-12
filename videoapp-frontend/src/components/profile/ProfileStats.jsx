import PropTypes from "prop-types";

function ProfileStats({
  videos = 0,
  followers = 0,
  following = 0,
}) {
  const stats = [
    {
      label: "Videos",
      value: videos,
    },
    {
      label: "Followers",
      value: followers,
    },
    {
      label: "Following",
      value: following,
    },
  ];

  return (
    <div className="w-full">
      <div className="flex items-center gap-8 sm:gap-10 md:gap-12">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex min-w-0 items-center gap-2"
          >
            <span
              className="
                text-[18px]
                font-semibold
                leading-none
                tracking-[-0.02em]
                text-[#f5f7fb]

                sm:text-[19px]
                md:text-[20px]
              "
            >
              {formatStatValue(stat.value)}
            </span>

            <span
              className="
                text-[12px]
                font-medium
                text-[#737c89]

                sm:text-[13px]
              "
            >
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatStatValue(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  if (numericValue >= 1_000_000) {
    const formatted =
      numericValue / 1_000_000;

    return `${formatDecimal(formatted)}M`;
  }

  if (numericValue >= 1_000) {
    const formatted =
      numericValue / 1_000;

    return `${formatDecimal(formatted)}K`;
  }

  return numericValue.toLocaleString();
}

function formatDecimal(value) {
  return Number(value.toFixed(1)).toString();
}

ProfileStats.propTypes = {
  videos: PropTypes.number,
  followers: PropTypes.number,
  following: PropTypes.number,
};

export default ProfileStats;