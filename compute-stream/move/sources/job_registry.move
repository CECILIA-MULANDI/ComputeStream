module computestream::job_registry{
    use std::string::String;
  use std::signer;

  /// Error codes
  const E_JOB_NOT_FOUND: u64 = 1;
  const E_NOT_AUTHORIZED: u64 = 2;
  const E_INVALID_STATUS: u64 = 3;

  /// Job status constants
  const STATUS_PENDING: u8 = 0;
  const STATUS_RUNNING: u8 = 1;
  const STATUS_COMPLETED: u8 = 2;
  const STATUS_FAILED: u8 = 3;
  const STATUS_CANCELLED: u8 = 4;
  /// Job information
  struct Job has key, store, drop {
    job_id: u64,
    buyer_address: address,
    provider_address: address,
    docker_image: String,
    status: u8,
    escrow_amount: u64,
    max_duration: u64,
    start_time: u64,
    end_time: u64,
    output_url: String,
  }

  /// Job counter to generate unique IDs
  struct JobCounter has key {
    count: u64,
  }

  /// Initialize job counter (call once on deployment)
  public entry fun initialize(admin: &signer) {
    let admin_addr = signer::address_of(admin);
    
    if (!exists<JobCounter>(admin_addr)) {
      move_to(admin, JobCounter { count: 0 });
    };
  }

  /// Create a new job
  public entry fun create_job(
    buyer: &signer,
    provider_address: address,
    docker_image: String,
    escrow_amount: u64,
    max_duration: u64,
    admin_addr: address,
  ) acquires JobCounter {
    let buyer_addr = signer::address_of(buyer);
    
    // Get next job ID
    let counter = borrow_global_mut<JobCounter>(admin_addr);
    let job_id = counter.count;
    counter.count = counter.count + 1;
    
    // Create job struct
    let job = Job {
      job_id,
      buyer_address: buyer_addr,
      provider_address,
      docker_image,
      status: STATUS_PENDING,
      escrow_amount,
      max_duration,
      start_time: 0,
      end_time: 0,
      output_url: std::string::utf8(b""),
    };
    
    // Store job under buyer's address with unique key
    // Note: In production, you'd want a more sophisticated storage pattern
    // For MVP, we'll store under buyer address
    move_to(buyer, job);
  }

  /// Start a job (provider calls this)
  public entry fun start_job(
    provider: &signer,
    buyer_address: address,
    start_time: u64,
  ) acquires Job {
    let provider_addr = signer::address_of(provider);
    
    // Borrow the job
    let job = borrow_global_mut<Job>(buyer_address);
    
    // Verify provider is authorized
    assert!(job.provider_address == provider_addr, E_NOT_AUTHORIZED);
    assert!(job.status == STATUS_PENDING, E_INVALID_STATUS);
    
    // Update job status
    job.status = STATUS_RUNNING;
    job.start_time = start_time;
  }

  /// Complete a job (provider calls this)
  public entry fun complete_job(
    provider: &signer,
    buyer_address: address,
    end_time: u64,
    output_url: String,
  ) acquires Job {
    let provider_addr = signer::address_of(provider);
    
    let job = borrow_global_mut<Job>(buyer_address);
    
    // Verify provider is authorized
    assert!(job.provider_address == provider_addr, E_NOT_AUTHORIZED);
    assert!(job.status == STATUS_RUNNING, E_INVALID_STATUS);
    
    // Update job status
    job.status = STATUS_COMPLETED;
    job.end_time = end_time;
    job.output_url = output_url;
  }

  /// Fail a job (provider or buyer can call this)
  public entry fun fail_job(
    account: &signer,
    buyer_address: address,
    end_time: u64,
  ) acquires Job {
    let caller_addr = signer::address_of(account);
    
    let job = borrow_global_mut<Job>(buyer_address);
    
    // Verify caller is either buyer or provider
    assert!(
      job.buyer_address == caller_addr || job.provider_address == caller_addr,
      E_NOT_AUTHORIZED
    );
    
    // Update job status
    job.status = STATUS_FAILED;
    job.end_time = end_time;
  }

  /// Cancel a job (buyer can call this before it starts)
  public entry fun cancel_job(
    buyer: &signer,
  ) acquires Job {
    let buyer_addr = signer::address_of(buyer);
    
    let job = borrow_global_mut<Job>(buyer_addr);
    
    // Can only cancel pending jobs
    assert!(job.status == STATUS_PENDING, E_INVALID_STATUS);
    
    job.status = STATUS_CANCELLED;
  }

  // View functions
  #[view]
  public fun get_job(buyer_address: address): (u64, address, address, u8, u64, u64, u64) acquires Job {
    let job = borrow_global<Job>(buyer_address);
    (
      job.job_id,
      job.buyer_address,
      job.provider_address,
      job.status,
      job.escrow_amount,
      job.start_time,
      job.end_time,
    )
  }

  #[view]
  public fun get_job_status(buyer_address: address): u8 acquires Job {
    let job = borrow_global<Job>(buyer_address);
    job.status
  }

  #[view]
  public fun is_job_active(buyer_address: address): bool acquires Job {
    if (!exists<Job>(buyer_address)) {
      return false
    };
    
    let job = borrow_global<Job>(buyer_address);
    job.status == STATUS_RUNNING
  }

  #[view]
  public fun get_job_duration(buyer_address: address): u64 acquires Job {
    let job = borrow_global<Job>(buyer_address);
    if (job.end_time > job.start_time) {
      job.end_time - job.start_time
    } else {
      0
    }
  }
}