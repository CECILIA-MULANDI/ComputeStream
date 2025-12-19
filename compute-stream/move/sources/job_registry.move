module computestream::job_registry{
  use std::string::String;
  use std::signer;
  use aptos_framework::table::{Self, Table};

  /// Error codes
  const E_JOB_NOT_FOUND: u64 = 1;
  const E_NOT_AUTHORIZED: u64 = 2;
  const E_INVALID_STATUS: u64 = 3;
  const E_JOB_ALREADY_EXISTS: u64 = 4;

  /// Job status constants
  const STATUS_PENDING: u8 = 0;
  const STATUS_RUNNING: u8 = 1;
  const STATUS_COMPLETED: u8 = 2;
  const STATUS_FAILED: u8 = 3;
  const STATUS_CANCELLED: u8 = 4;

  /// Job information
  struct Job has store, drop {
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

  /// Container for storing multiple jobs per buyer
  struct JobStore has key {
    jobs: Table<u64, Job>,
  }

  /// Job counter to generate unique IDs (module-level singleton)
  struct JobCounter has key {
    count: u64,
  }


  /// Initialize job counter (call once on deployment by module deployer)
  /// The counter is stored under the module address (@computestream)
  public entry fun initialize(deployer: &signer) {
    // Verify deployer controls the module address
    let deployer_addr = signer::address_of(deployer);
    assert!(deployer_addr == @computestream, E_NOT_AUTHORIZED);
    
    if (!exists<JobCounter>(@computestream)) {
      move_to(deployer, JobCounter { count: 0 });
    };
  }

  /// Create a new job
  public entry fun create_job(
    buyer: &signer,
    provider_address: address,
    docker_image: String,
    escrow_amount: u64,
    max_duration: u64,
  ) acquires JobCounter, JobStore {
    let buyer_addr = signer::address_of(buyer);
    
    // Ensure counter is initialized
    assert!(exists<JobCounter>(@computestream), E_JOB_NOT_FOUND);
    
    // Initialize job store if it doesn't exist
    if (!exists<JobStore>(buyer_addr)) {
      move_to(buyer, JobStore {
        jobs: table::new(),
      });
    };
    
    // Get next job ID from module-level counter
    let counter = borrow_global_mut<JobCounter>(@computestream);
    let job_id = counter.count;
    counter.count = counter.count + 1;
    
    // Get job store
    let job_store = borrow_global_mut<JobStore>(buyer_addr);
    
    // Check if job already exists
    assert!(!table::contains(&job_store.jobs, job_id), E_JOB_ALREADY_EXISTS);
    
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
    
    // Store job in table
    table::add(&mut job_store.jobs, job_id, job);
  }

  /// Start a job (provider calls this)
  public entry fun start_job(
    provider: &signer,
    buyer_address: address,
    job_id: u64,
    start_time: u64,
  ) acquires JobStore {
    let provider_addr = signer::address_of(provider);
    
    // Get job store and job
    let job_store = borrow_global_mut<JobStore>(buyer_address);
    assert!(table::contains(&job_store.jobs, job_id), E_JOB_NOT_FOUND);
    
    let job = table::borrow_mut(&mut job_store.jobs, job_id);
    
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
    job_id: u64,
    end_time: u64,
    output_url: String,
  ) acquires JobStore {
    let provider_addr = signer::address_of(provider);
    
    let job_store = borrow_global_mut<JobStore>(buyer_address);
    assert!(table::contains(&job_store.jobs, job_id), E_JOB_NOT_FOUND);
    
    let job = table::borrow_mut(&mut job_store.jobs, job_id);
    
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
    job_id: u64,
    end_time: u64,
  ) acquires JobStore {
    let caller_addr = signer::address_of(account);
    
    let job_store = borrow_global_mut<JobStore>(buyer_address);
    assert!(table::contains(&job_store.jobs, job_id), E_JOB_NOT_FOUND);
    
    let job = table::borrow_mut(&mut job_store.jobs, job_id);
    
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
    job_id: u64,
  ) acquires JobStore {
    let buyer_addr = signer::address_of(buyer);
    
    let job_store = borrow_global_mut<JobStore>(buyer_addr);
    assert!(table::contains(&job_store.jobs, job_id), E_JOB_NOT_FOUND);
    
    let job = table::borrow_mut(&mut job_store.jobs, job_id);
    
    // Verify buyer owns the job
    assert!(job.buyer_address == buyer_addr, E_NOT_AUTHORIZED);
    
    // Can only cancel pending jobs
    assert!(job.status == STATUS_PENDING, E_INVALID_STATUS);
    
    job.status = STATUS_CANCELLED;
  }

  // View functions
  #[view]
  public fun get_job(buyer_address: address, job_id: u64): (u64, address, address, u8, u64, u64, u64) acquires JobStore {
    assert!(exists<JobStore>(buyer_address), E_JOB_NOT_FOUND);
    let job_store = borrow_global<JobStore>(buyer_address);
    assert!(table::contains(&job_store.jobs, job_id), E_JOB_NOT_FOUND);
    
    let job = table::borrow(&job_store.jobs, job_id);
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
  public fun get_job_status(buyer_address: address, job_id: u64): u8 acquires JobStore {
    assert!(exists<JobStore>(buyer_address), E_JOB_NOT_FOUND);
    let job_store = borrow_global<JobStore>(buyer_address);
    assert!(table::contains(&job_store.jobs, job_id), E_JOB_NOT_FOUND);
    
    let job = table::borrow(&job_store.jobs, job_id);
    job.status
  }

  #[view]
  public fun is_job_active(buyer_address: address, job_id: u64): bool acquires JobStore {
    if (!exists<JobStore>(buyer_address)) {
      return false
    };
    
    let job_store = borrow_global<JobStore>(buyer_address);
    if (!table::contains(&job_store.jobs, job_id)) {
      return false
    };
    
    let job = table::borrow(&job_store.jobs, job_id);
    job.status == STATUS_RUNNING
  }

  #[view]
  public fun get_job_duration(buyer_address: address, job_id: u64): u64 acquires JobStore {
    assert!(exists<JobStore>(buyer_address), E_JOB_NOT_FOUND);
    let job_store = borrow_global<JobStore>(buyer_address);
    assert!(table::contains(&job_store.jobs, job_id), E_JOB_NOT_FOUND);
    
    let job = table::borrow(&job_store.jobs, job_id);
    if (job.end_time > job.start_time) {
      job.end_time - job.start_time
    } else {
      0
    }
  }

  #[view]
  public fun get_job_output_url(buyer_address: address, job_id: u64): String acquires JobStore {
    assert!(exists<JobStore>(buyer_address), E_JOB_NOT_FOUND);
    let job_store = borrow_global<JobStore>(buyer_address);
    assert!(table::contains(&job_store.jobs, job_id), E_JOB_NOT_FOUND);
    
    let job = table::borrow(&job_store.jobs, job_id);
    job.output_url
  }
}